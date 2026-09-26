import { toSchemaError } from "./errors";
import { evaluateJevSignals } from "./jev/evaluator";
import { buildSystemPrompt, serializeConversation } from "./prompts";
import { parseReasoningOutput } from "./reasoning/decision";
import { reasoningChat } from "./reasoning/client";
import { deriveRoute } from "./routing";
import type { BaselineResult, ChatMessage, ExperimentConfig, WithJevResult } from "./types";

/**
 * The two experiment paths.
 *
 * Both use the same reasoning model, temperature, prompt and output schema.
 * Total latency is measured independently around the whole pipeline
 * (Jev call + serialization + routing + reasoning call), not summed.
 */

export async function runBaseline(
  messages: ChatMessage[],
  config: ExperimentConfig,
): Promise<BaselineResult> {
  const started = performance.now();
  const call = await reasoningChat(
    config.reasoning,
    [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: serializeConversation(messages) },
    ],
    config.temperature,
  );
  const totalLatencyMs = performance.now() - started;

  if (!call.ok) {
    return {
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      modelCalls: call.madeCall ? 1 : 0,
      retryCount: 0,
      error: call.error,
    };
  }
  try {
    const parsed = parseReasoningOutput(call.content);
    return {
      decision: {
        intents: parsed.intents,
        route: deriveRoute(parsed.intents, parsed.needsHumanReview),
        response: parsed.response,
      },
      needsHumanReviewRaw: parsed.needsHumanReview,
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      usage: call.usage,
      modelCalls: 1,
      retryCount: 0,
    };
  } catch (e) {
    return {
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      usage: call.usage,
      modelCalls: 1,
      retryCount: 0,
      error: toSchemaError(e),
    };
  }
}

export async function runWithJev(
  messages: ChatMessage[],
  config: ExperimentConfig,
): Promise<WithJevResult> {
  const started = performance.now();
  const jev = await evaluateJevSignals(messages, config.jev);

  // Jev failure fails the whole With-Jev path explicitly — no default signals.
  if (jev.error || !jev.signals) {
    return {
      jev,
      totalLatencyMs: performance.now() - started,
      modelCalls: jev.modelCalls,
      retryCount: 0,
      error: jev.error ?? { type: "unknown", message: "Jev 未返回信号" },
    };
  }

  const call = await reasoningChat(
    config.reasoning,
    [
      { role: "system", content: buildSystemPrompt(jev.signals) },
      { role: "user", content: serializeConversation(messages) },
    ],
    config.temperature,
  );
  const totalLatencyMs = performance.now() - started;

  if (!call.ok) {
    return {
      jev,
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      modelCalls: jev.modelCalls + (call.madeCall ? 1 : 0),
      retryCount: 0,
      error: call.error,
    };
  }
  try {
    const parsed = parseReasoningOutput(call.content);
    return {
      jev,
      decision: {
        intents: parsed.intents,
        route: deriveRoute(parsed.intents, jev.signals.needsHumanReview.value),
        response: parsed.response,
      },
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      reasoningUsage: call.usage,
      modelCalls: jev.modelCalls + 1,
      retryCount: 0,
    };
  } catch (e) {
    return {
      jev,
      reasoningLatencyMs: call.latencyMs,
      totalLatencyMs,
      reasoningUsage: call.usage,
      modelCalls: jev.modelCalls + 1,
      retryCount: 0,
      error: toSchemaError(e),
    };
  }
}
