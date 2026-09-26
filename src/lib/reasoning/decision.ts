import { SchemaValidationError } from "../errors";
import { INTENTS, type Intent, type ReasoningOutput } from "../types";

/**
 * 解析并严格校验推理模型的 JSON 输出。
 * 缺字段 / 非法字段是显式的 schema_validation 失败 —— 绝不静默降级为"成功"。
 */
export function parseReasoningOutput(content: string): ReasoningOutput {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new SchemaValidationError(
      `推理输出中不包含 JSON 对象：${content.slice(0, 200)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch (e) {
    throw new SchemaValidationError(
      `推理输出不是合法 JSON：${(e as Error).message}。原始输出：${content.slice(0, 200)}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SchemaValidationError("推理输出 JSON 不是对象");
  }
  const obj = parsed as Record<string, unknown>;

  const rawIntents = obj.intents;
  if (!Array.isArray(rawIntents)) {
    throw new SchemaValidationError("推理输出缺少 \"intents\" 数组");
  }
  const intents: Intent[] = [];
  for (const item of rawIntents) {
    if (typeof item !== "string" || !INTENTS.includes(item as Intent)) {
      throw new SchemaValidationError(`未知意图值：${JSON.stringify(item)}`);
    }
    if (!intents.includes(item as Intent)) intents.push(item as Intent);
  }

  if (typeof obj.needsHumanReview !== "boolean") {
    throw new SchemaValidationError(
      "推理输出缺少布尔值 \"needsHumanReview\"",
    );
  }
  if (typeof obj.response !== "string") {
    throw new SchemaValidationError("推理输出缺少字符串 \"response\"");
  }

  return { intents, needsHumanReview: obj.needsHumanReview, response: obj.response };
}
