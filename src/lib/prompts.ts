import type { ChatMessage, JevSignals } from "./types";

export const PROMPT_VERSION = "v1";

/**
 * The system prompt is identical for both paths — the ONLY allowed difference is
 * that the With-Jev path additionally receives the Jev signals block. The
 * baseline must not be given a weaker prompt, and With Jev must not get a
 * stronger business prompt.
 */
const BASE_SYSTEM_PROMPT = `You are the triage step of an e-commerce customer-service system. Read the customer conversation and respond with ONLY a JSON object (no markdown, no extra text) with exactly this schema:
{"intents": ["..."], "needsHumanReview": false, "response": "..."}

Field rules:
- "intents": a subset of ["product","order","logistics","refund","cancel","payment","complaint","other"]. Multi-label: include every intent present in the customer's latest messages. Use "other" only when nothing else fits.
- "needsHumanReview": boolean. true when the conversation should be escalated to a human agent: refund or cancellation requests, billing disputes, strong frustration, or anything an automated assistant cannot resolve. Otherwise false.
- "response": a short customer-facing reply, written in the same language the customer used.

Routing policy applied downstream: a conversation is routed to a human agent when needsHumanReview is true, or when intents include "refund" or "cancel".`;

function formatProbability(p: number): string {
  return `${(p * 100).toFixed(0)}%`;
}

export function buildSignalsBlock(signals: JevSignals): string {
  const intentLines = (Object.keys(signals.intents) as Array<keyof typeof signals.intents>).map(
    (intent) =>
      `- ${intent}: ${signals.intents[intent].probability.toFixed(2)} (${
        signals.intents[intent].value ? "yes" : "no"
      })`,
  );
  return [
    "A fast pre-classifier (Jev) already analyzed this conversation. Its atomic yes-probabilities (0-1):",
    ...intentLines,
    `- needsHumanReview: ${signals.needsHumanReview.probability.toFixed(2)} (${
      signals.needsHumanReview.value ? "yes" : "no"
    })`,
    `- frustrated: ${signals.frustrated.probability.toFixed(2)} (${
      signals.frustrated.value ? "yes" : "no"
    })`,
    `- topicChanged: ${signals.topicChanged.probability.toFixed(2)} (${
      signals.topicChanged.value ? "yes" : "no"
    })`,
    "",
    "Treat these as hints from a lightweight model; they may be wrong. Weigh them together with your own reading of the conversation.",
  ].join("\n");
}

export function buildSystemPrompt(signals?: JevSignals): string {
  return signals ? `${BASE_SYSTEM_PROMPT}\n\n${buildSignalsBlock(signals)}` : BASE_SYSTEM_PROMPT;
}

export function serializeConversation(messages: ChatMessage[]): string {
  return `Conversation:\n${messages.map((m) => `[${m.role}] ${m.content}`).join("\n")}`;
}
