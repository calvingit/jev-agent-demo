import type {
  ChatMessage,
  JevConfig,
  JevIntent,
  JevRunResult,
  JevSignal,
  JevSignals,
} from "../types";
import { JEVD_INTENTS } from "../types";
import { evaluateWithJev } from "./client";
import { intentQuestionName } from "./questions";

/**
 * JevEvaluator: turns a raw TypeSafe System One response into typed JevSignals.
 * Raw Noul probabilities are preserved; the 0.5 threshold only derives the boolean.
 */

export const NOUL_THRESHOLD = 0.5;

export function toSignal(probability: number): JevSignal {
  return { probability, value: probability >= NOUL_THRESHOLD };
}

export function buildConversationState(messages: ChatMessage[]): unknown {
  return {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
}

function readNoul(answers: Record<string, unknown>, key: string): number {
  const answer = answers[key];
  if (answer === undefined || answer === null) {
    throw new Error(`Jev 响应缺少答案 "${key}"`);
  }
  let candidate: unknown = answer;
  if (typeof answer === "object" && !Array.isArray(answer)) {
    const obj = answer as Record<string, unknown>;
    candidate = obj.noul ?? obj.probability ?? obj.value;
  }
  const p = typeof candidate === "number" ? candidate : NaN;
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error(`Jev 返回的 Noul 概率非法（"${key}"）：${JSON.stringify(answer)}`);
  }
  return p;
}

export function extractSignals(raw: unknown): JevSignals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Jev 响应中没有 answers 对象");
  }
  const answers = raw as Record<string, unknown>;

  const intents = {} as Record<JevIntent, JevSignal>;
  for (const intent of JEVD_INTENTS) {
    intents[intent] = toSignal(readNoul(answers, intentQuestionName(intent)));
  }
  return {
    intents,
    needsHumanReview: toSignal(readNoul(answers, "needsHumanReview")),
    frustrated: toSignal(readNoul(answers, "frustrated")),
    topicChanged: toSignal(readNoul(answers, "topicChanged")),
  };
}

export async function evaluateJevSignals(
  messages: ChatMessage[],
  config: JevConfig,
): Promise<JevRunResult> {
  const result = await evaluateWithJev(buildConversationState(messages), config);
  if (result.error) return result;
  try {
    result.signals = extractSignals(result.rawAnswers);
  } catch (e) {
    // Never fabricate signals from a malformed response: fail explicitly.
    result.error = {
      type: "schema_validation",
      message: e instanceof Error ? e.message : String(e),
    };
    delete result.signals;
  }
  return result;
}
