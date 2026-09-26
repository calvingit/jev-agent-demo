import { compareCase } from "@/lib/comparison";
import { runBaseline, runWithJev } from "@/lib/runners";
import { resolveConfig } from "@/lib/server-config";
import type { ChatMessage, EvaluateRequest, TestCase } from "@/lib/types";

// Node runtime: the TypeSafe SDK rejects browser use, and keys must stay server-side.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs BOTH experiment paths for one conversation (baseline and with-Jev in
 * parallel; Jev → reasoning stays serial inside the with-Jev path) and returns
 * the results plus the comparison. Errors are returned in-band per path —
 * never converted into fabricated successes.
 */
export async function POST(req: Request) {
  let body: EvaluateRequest;
  try {
    body = (await req.json()) as EvaluateRequest;
  } catch {
    return Response.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const messages: ChatMessage[] = Array.isArray(body?.messages)
    ? body.messages
        .filter(
          (m): m is ChatMessage =>
            Boolean(m) &&
            typeof m === "object" &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .map((m) => ({ role: m.role, content: m.content }))
    : [];
  if (messages.length === 0) {
    return Response.json({ error: "至少需要一条对话消息" }, { status: 400 });
  }

  const config = resolveConfig(body.config);
  const testCase: TestCase = {
    id: typeof body.caseId === "string" && body.caseId ? body.caseId : "adhoc",
    name: "adhoc",
    messages,
    expected: body.expected,
  };

  const [baseline, withJev] = await Promise.all([
    runBaseline(messages, config),
    runWithJev(messages, config),
  ]);
  const comparison = compareCase(testCase, baseline, withJev);

  return Response.json({ baseline, withJev, comparison });
}
