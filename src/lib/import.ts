import { INTENTS, type ChatMessage, type Expected, type Intent, type Role, type TestCase } from "./types";

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFormatError";
  }
}

function parseRole(value: unknown, context: string): Role {
  if (value === "user" || value === "assistant") return value;
  throw new ImportFormatError(
    `${context}：消息角色必须是 "user" 或 "assistant"，实际是 ${JSON.stringify(value)}`,
  );
}

function parseIntents(value: unknown, context: string): Intent[] {
  if (value === undefined || value === null || value === "") return [];
  const list = Array.isArray(value) ? value : String(value).split(/[|;]/);
  const intents: Intent[] = [];
  for (const item of list) {
    const intent = String(item).trim().toLowerCase();
    if (!intent) continue;
    if (!INTENTS.includes(intent as Intent)) {
      throw new ImportFormatError(
        `${context}：未知意图 "${intent}"（允许：${INTENTS.join(", ")}）`,
      );
    }
    if (!intents.includes(intent as Intent)) intents.push(intent as Intent);
  }
  return intents;
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  throw new ImportFormatError(`应为布尔值（true/false），实际是 ${JSON.stringify(value)}`);
}

function normalizeExpected(raw: unknown, context: string): Expected | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ImportFormatError(`${context}："expected" 必须是对象`);
  }
  const rawExpected = raw as Record<string, unknown>;
  const expected: Expected = {};
  const intents = parseIntents(rawExpected.intents, context);
  if (intents.length) expected.intents = intents;
  if (rawExpected.route !== undefined && rawExpected.route !== null && rawExpected.route !== "") {
    if (rawExpected.route !== "agent" && rawExpected.route !== "human") {
      throw new ImportFormatError(`${context}：expected.route 必须是 "agent" 或 "human"`);
    }
    expected.route = rawExpected.route;
  }
  const nhr = parseOptionalBool(rawExpected.needsHumanReview);
  if (nhr !== undefined) expected.needsHumanReview = nhr;
  const frustrated = parseOptionalBool(rawExpected.frustrated);
  if (frustrated !== undefined) expected.frustrated = frustrated;
  const topicChanged = parseOptionalBool(rawExpected.topicChanged);
  if (topicChanged !== undefined) expected.topicChanged = topicChanged;
  return Object.keys(expected).length ? expected : undefined;
}

function normalizeCase(raw: unknown, index: number): TestCase {
  const context = `第 ${index + 1} 条用例`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ImportFormatError(`${context}：应为对象`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id.trim()) {
    throw new ImportFormatError(`${context}：缺少字符串 "id"`);
  }
  const rawMessages = obj.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new ImportFormatError(`${context}（${obj.id}）："messages" 必须是非空数组`);
  }
  const messages: ChatMessage[] = rawMessages.map((m, i) => {
    if (!m || typeof m !== "object") {
      throw new ImportFormatError(`${context}（${obj.id}）第 ${i + 1} 条消息：应为对象`);
    }
    const msg = m as Record<string, unknown>;
    return {
      role: parseRole(msg.role, `${context}（${obj.id}）第 ${i + 1} 条消息`),
      content: typeof msg.content === "string" ? msg.content : String(msg.content ?? ""),
    };
  });
  return {
    id: obj.id.trim(),
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : obj.id.trim(),
    messages,
    expected: normalizeExpected(obj.expected, context),
  };
}

/** 接受用例数组或 {"cases": [...]} 两种 JSON 形态。 */
export function parseCasesJson(text: string): TestCase[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new ImportFormatError(`JSON 格式错误：${(e as Error).message}`);
  }
  let list: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>).cases)
  ) {
    list = (parsed as Record<string, unknown>).cases as unknown[];
  }
  if (!list) {
    throw new ImportFormatError("JSON 导入必须是用例数组或 {\"cases\": [...]}");
  }
  if (list.length === 0) throw new ImportFormatError("JSON 导入中没有用例");
  return list.map((raw, i) => normalizeCase(raw, i));
}

/** 极简 RFC4180 CSV 解析（支持引号、逗号、换行）。 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const input = text.replace(/^\uFEFF/, "");
  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const CSV_COLUMNS = [
  "id",
  "name",
  "role",
  "content",
  "expected_intents",
  "expected_route",
  "expected_needs_human_review",
  "expected_frustrated",
  "expected_topic_changed",
] as const;

/**
 * CSV 导入。一行一条消息；相同 id 的连续行组成一条多轮对话。
 * expected 字段可写在组内任意一行，首个非空值生效。
 *
 *   id,name,role,content,expected_intents,expected_route,expected_needs_human_review,expected_frustrated,expected_topic_changed
 *   refund-en,退款,user,"I want a refund for order #4521.",refund,human,true,,
 */
export function parseCasesCsv(text: string): TestCase[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new ImportFormatError("CSV 需要表头行和至少一行数据");

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const columnIndexes = new Map<string, number>();
  CSV_COLUMNS.forEach((col) => {
    const index = header.indexOf(col);
    if (index !== -1) columnIndexes.set(col, index);
  });
  for (const required of ["id", "role", "content"] as const) {
    if (!columnIndexes.has(required)) {
      throw new ImportFormatError(`CSV 缺少必需列 "${required}"`);
    }
  }

  const cell = (row: string[], col: (typeof CSV_COLUMNS)[number]): string | undefined => {
    const index = columnIndexes.get(col);
    return index === undefined ? undefined : row[index];
  };

  const order: string[] = [];
  const grouped = new Map<
    string,
    { testCase: TestCase; rawExpected: Record<string, string | undefined> }
  >();
  let contextIndex = 0;

  for (const row of rows.slice(1)) {
    contextIndex += 1;
    const id = (cell(row, "id") ?? "").trim();
    if (!id) throw new ImportFormatError(`CSV 第 ${contextIndex + 1} 行："id" 为空`);
    const context = `CSV 第 ${contextIndex + 1} 行（${id}）`;
    const role = parseRole((cell(row, "role") ?? "").trim().toLowerCase(), context);
    const content = cell(row, "content") ?? "";
    const message: ChatMessage = { role, content };

    const rawRowExpected: Record<string, string | undefined> = {
      intents: cell(row, "expected_intents"),
      route: cell(row, "expected_route"),
      needsHumanReview: cell(row, "expected_needs_human_review"),
      frustrated: cell(row, "expected_frustrated"),
      topicChanged: cell(row, "expected_topic_changed"),
    };

    const existing = grouped.get(id);
    if (existing) {
      existing.testCase.messages.push(message);
      // expected 可写在组内任意一行，首个非空值生效。
      for (const [key, value] of Object.entries(rawRowExpected)) {
        if (value !== undefined && value !== "" && !existing.rawExpected[key]) {
          existing.rawExpected[key] = value;
        }
      }
      continue;
    }

    grouped.set(id, {
      testCase: {
        id,
        name: (cell(row, "name") ?? "").trim() || id,
        messages: [message],
      },
      rawExpected: rawRowExpected,
    });
    order.push(id);
  }

  if (order.length === 0) throw new ImportFormatError("CSV 中没有数据行");
  return order.map((id) => {
    const group = grouped.get(id)!;
    group.testCase.expected = normalizeExpected(group.rawExpected, `用例 ${id}`);
    return group.testCase;
  });
}
