import type { Intent, Route } from "./types";

/**
 * Shared routing policy — applied identically to both paths so the comparison
 * measures Jev, not "LLM routing vs deterministic routing".
 *
 * - Baseline path: needsHumanReview comes from the reasoning model's own assessment.
 * - With-Jev path: needsHumanReview comes from Jev's atomic Noul judgment.
 *
 * Same business rule, same mechanism; the only difference is the signal source,
 * which is exactly the variable under test.
 */
export const ESCALATION_INTENTS: readonly Intent[] = ["refund", "cancel"];

export function deriveRoute(intents: Intent[], needsHumanReview: boolean): Route {
  if (needsHumanReview) return "human";
  if (intents.some((intent) => ESCALATION_INTENTS.includes(intent))) return "human";
  return "agent";
}
