import { intentsF1, sameSet } from "./metrics";
import type { CaseComparison, CaseOutcome, TestCase, BaselineResult, WithJevResult } from "./types";

/**
 * Per-case comparison (doc §29).
 *
 * With ground truth: improved / worse / same / different / error.
 * Without ground truth: same / different / error only — never improved, worse
 * or any accuracy claim.
 *
 * Quality is judged primarily on Route (via expected.route or
 * expected.needsHumanReview); when only expected.intents exists, on intent F1.
 */
export function compareCase(
  testCase: TestCase,
  baseline: BaselineResult,
  withJev: WithJevResult,
): CaseComparison {
  const expected = testCase.expected;
  const hasGroundTruth = Boolean(
    expected &&
      (expected.intents?.length ||
        expected.route ||
        expected.needsHumanReview !== undefined ||
        expected.frustrated !== undefined ||
        expected.topicChanged !== undefined),
  );

  const bDecision = baseline.decision;
  const wDecision = withJev.decision;

  const decisionsComparable = Boolean(bDecision && wDecision);
  const routeChanged = decisionsComparable && bDecision!.route !== wDecision!.route;
  const intentSetChanged = decisionsComparable && !sameSet(bDecision!.intents, wDecision!.intents);
  const humanEscalationChanged =
    decisionsComparable &&
    (bDecision!.route === "human") !== (wDecision!.route === "human");

  let baselineRouteCorrect: boolean | null = null;
  let withJevRouteCorrect: boolean | null = null;
  if (expected?.route) {
    baselineRouteCorrect = bDecision ? bDecision.route === expected.route : false;
    withJevRouteCorrect = wDecision ? wDecision.route === expected.route : false;
  } else if (typeof expected?.needsHumanReview === "boolean") {
    baselineRouteCorrect = bDecision
      ? (bDecision.route === "human") === expected.needsHumanReview
      : false;
    withJevRouteCorrect = wDecision
      ? (wDecision.route === "human") === expected.needsHumanReview
      : false;
  }

  let baselineIntentsF1: number | null = null;
  let withJevIntentsF1: number | null = null;
  if (expected?.intents) {
    baselineIntentsF1 = bDecision ? intentsF1(bDecision.intents, expected.intents).f1 : 0;
    withJevIntentsF1 = wDecision ? intentsF1(wDecision.intents, expected.intents).f1 : 0;
  }

  const decisionsEqual =
    decisionsComparable &&
    bDecision!.route === wDecision!.route &&
    sameSet(bDecision!.intents, wDecision!.intents);

  const anyError = Boolean(baseline.error || withJev.error);

  let outcome: CaseOutcome;
  if (anyError) {
    outcome = "error";
  } else if (!hasGroundTruth) {
    outcome = decisionsEqual ? "same" : "different";
  } else if (baselineRouteCorrect !== null) {
    if (!baselineRouteCorrect && withJevRouteCorrect) {
      outcome = "improved";
    } else if (baselineRouteCorrect && !withJevRouteCorrect) {
      outcome = "worse";
    } else {
      outcome = decisionsEqual ? "same" : "different";
    }
  } else if (baselineIntentsF1 !== null) {
    const eps = 1e-9;
    if (withJevIntentsF1! > baselineIntentsF1 + eps) {
      outcome = "improved";
    } else if (withJevIntentsF1! < baselineIntentsF1 - eps) {
      outcome = "worse";
    } else {
      outcome = decisionsEqual ? "same" : "different";
    }
  } else {
    // Ground truth exists but neither route nor intents are judgeable
    // (e.g. only frustrated/topicChanged): fall back to agreement.
    outcome = decisionsEqual ? "same" : "different";
  }

  return {
    outcome,
    hasGroundTruth,
    baselineRouteCorrect,
    withJevRouteCorrect,
    baselineIntentsF1,
    withJevIntentsF1,
    routeChanged,
    intentSetChanged,
    humanEscalationChanged,
  };
}
