import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifySdkError } from "../errors";
import type { JevConfig, JevRunResult, TokenUsage } from "../types";
import { buildQuestions } from "./questions";

/**
 * The Jev client is deliberately separate from the reasoning-model client:
 * Jev = TypeSafe System One atomic judgments, reasoning = OpenAI-compatible
 * chat completions. They share no abstraction on purpose.
 *
 * Retries are hard-disabled (retry.maxRetries = 0) for the experiment:
 * a hidden retry would pollute latency, call counts, error rate and
 * reliability measurements.
 */

// .env may hold either the API root (https://api.typesafe.ai) or the full
// System One endpoint; the SDK always appends /v1/systemone itself.
export function normalizeTypesafeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/v1\/systemone$/i, "").replace(/\/systemone$/i, "");
}

function elapsedMs(started: number): number {
  return performance.now() - started;
}

export function mapJevUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const input = typeof u.input_tokens === "number" ? u.input_tokens : undefined;
  const output = typeof u.output_tokens === "number" ? u.output_tokens : undefined;
  if (input === undefined && output === undefined) return undefined;
  const total =
    typeof u.total_tokens === "number"
      ? u.total_tokens
      : input !== undefined && output !== undefined
        ? input + output
        : undefined;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

export async function evaluateWithJev(state: unknown, config: JevConfig): Promise<JevRunResult> {
  const started = performance.now();
  if (!config.apiKey) {
    return {
      latencyMs: 0,
      modelCalls: 0,
      retryCount: 0,
      error: {
        type: "unknown",
        message:
          "未配置 Jev API Key。请在服务端 .env 设置 JEV_API_KEY，或在“模型设置”中填写。",
      },
    };
  }

  let client: TypeSafeClient;
  try {
    client = new TypeSafeClient({
      apiKey: config.apiKey,
      baseURL: normalizeTypesafeBaseUrl(config.baseUrl),
      defaultModel: config.model,
      timeout: config.timeoutMs,
      // Experiment requirement: observe the true single-call behavior.
      retry: { maxRetries: 0 },
      logLevel: "off",
    });
  } catch (e) {
    return {
      latencyMs: elapsedMs(started),
      modelCalls: 0,
      retryCount: 0,
      error: classifySdkError(e),
    };
  }

  try {
    const result = await client.systemOne(
      { model: config.model, state: state as never, questions: buildQuestions() },
      { timeout: config.timeoutMs, retry: { maxRetries: 0 } },
    );
    return {
      rawAnswers: result.answers,
      latencyMs: elapsedMs(started),
      usage: mapJevUsage(result.usage),
      modelCalls: 1,
      retryCount: 0,
    };
  } catch (e) {
    return {
      latencyMs: elapsedMs(started),
      modelCalls: 1,
      retryCount: 0,
      error: classifySdkError(e),
    };
  }
}
