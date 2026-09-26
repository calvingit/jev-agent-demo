import type { AgentDecision, CaseOutcome, CaseResult, Intent, TestCase } from "./types";

export interface IntentPrf {
  precision: number;
  recall: number;
  f1: number;
}

export function sameSet(a: Intent[], b: Intent[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, i) => value === sortedB[i]);
}

/** Multi-label precision/recall/F1 for one case (doc §27). */
export function intentsF1(predicted: Intent[], expected: Intent[]): IntentPrf {
  const tp = predicted.filter((i) => expected.includes(i)).length;
  const fp = predicted.length - tp;
  const fn = expected.filter((i) => !predicted.includes(i)).length;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/** Linear-interpolation percentile. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface PathQualityMetrics {
  successfulCases: number;
  errorCount: number;
  routeJudgedCases: number;
  routeCorrectCases: number;
  routeAccuracy: number | null;
  intentJudgedCases: number;
  // Micro-averaged over all cases with expected.intents.
  intentPrecision: number | null;
  intentRecall: number | null;
  intentF1: number | null;
  intentExactMatch: number | null;
  humanReviewCases: number;
  humanReviewHits: number;
  humanReviewRecall: number | null;
  avgTotalLatencyMs: number | null;
  p95TotalLatencyMs: number | null;
  reasoningTokens: number;
}

export interface JevMetrics {
  callCount: number;
  errorCount: number;
  errorRate: number | null;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  totalTokens: number;
}

export interface BatchSummary {
  caseCount: number;
  outcomes: Record<CaseOutcome, number>;
  baseline: PathQualityMetrics;
  withJev: PathQualityMetrics;
  jev: JevMetrics;
  totalModelCalls: number;
}

function isRouteJudged(expected?: TestCase["expected"]): boolean {
  if (!expected) return false;
  return Boolean(expected.route) || typeof expected.needsHumanReview === "boolean";
}

// A case counts towards Human Review Recall when ground truth says it should
// have been escalated (explicitly, or via expected.route = "human").
function expectedHuman(expected?: TestCase["expected"]): boolean {
  if (!expected) return false;
  return expected.needsHumanReview === true || expected.route === "human";
}

interface PathAccumulator {
  metrics: PathQualityMetrics;
  latencies: number[];
  tp: number;
  fp: number;
  fn: number;
  exactMatches: number;
  intentJudged: number;
}

function newAccumulator(): PathAccumulator {
  return {
    metrics: {
      successfulCases: 0,
      errorCount: 0,
      routeJudgedCases: 0,
      routeCorrectCases: 0,
      routeAccuracy: null,
      intentJudgedCases: 0,
      intentPrecision: null,
      intentRecall: null,
      intentF1: null,
      intentExactMatch: null,
      humanReviewCases: 0,
      humanReviewHits: 0,
      humanReviewRecall: null,
      avgTotalLatencyMs: null,
      p95TotalLatencyMs: null,
      reasoningTokens: 0,
    },
    latencies: [],
    tp: 0,
    fp: 0,
    fn: 0,
    exactMatches: 0,
    intentJudged: 0,
  };
}

interface PathInput {
  decision?: AgentDecision;
  pathError: boolean;
  latencyMs: number;
  tokens?: number;
  routeCorrect: boolean | null;
}

function accumulatePath(acc: PathAccumulator, expected: TestCase["expected"], path: PathInput): void {
  const m = acc.metrics;
  if (path.pathError) {
    m.errorCount += 1;
    return;
  }
  if (!path.decision) return;

  m.successfulCases += 1;
  acc.latencies.push(path.latencyMs);
  m.reasoningTokens += path.tokens ?? 0;

  if (isRouteJudged(expected) && path.routeCorrect !== null) {
    m.routeJudgedCases += 1;
    if (path.routeCorrect) m.routeCorrectCases += 1;
  }

  if (expected?.intents) {
    acc.intentJudged += 1;
    for (const i of expected.intents) {
      if (path.decision.intents.includes(i)) acc.tp += 1;
      else acc.fn += 1;
    }
    acc.fp += path.decision.intents.filter((i) => !expected.intents!.includes(i)).length;
    if (sameSet(path.decision.intents, expected.intents)) acc.exactMatches += 1;
  }

  if (expectedHuman(expected)) {
    m.humanReviewCases += 1;
    if (path.decision.route === "human") m.humanReviewHits += 1;
  }
}

function finalizePath(acc: PathAccumulator): PathQualityMetrics {
  const m = acc.metrics;
  m.routeAccuracy = m.routeJudgedCases > 0 ? m.routeCorrectCases / m.routeJudgedCases : null;

  const precision = acc.tp + acc.fp > 0 ? acc.tp / (acc.tp + acc.fp) : null;
  const recall = acc.tp + acc.fn > 0 ? acc.tp / (acc.tp + acc.fn) : null;
  m.intentPrecision = precision;
  m.intentRecall = recall;
  if (precision === null && recall === null) {
    m.intentF1 = null;
  } else {
    const p = precision ?? 0;
    const r = recall ?? 0;
    m.intentF1 = p + r > 0 ? (2 * p * r) / (p + r) : 0;
  }
  m.intentJudgedCases = acc.intentJudged;
  m.intentExactMatch = acc.intentJudged > 0 ? acc.exactMatches / acc.intentJudged : null;

  m.humanReviewRecall = m.humanReviewCases > 0 ? m.humanReviewHits / m.humanReviewCases : null;
  m.avgTotalLatencyMs = avg(acc.latencies);
  m.p95TotalLatencyMs = percentile(acc.latencies, 95);
  return m;
}

export interface BatchEntry {
  testCase: TestCase;
  result: CaseResult;
}

/**
 * Batch metrics over all case results. Latency/token aggregates include only
 * successful runs; errors are counted separately (doc §26).
 */
export function computeBatchSummary(entries: BatchEntry[]): BatchSummary {
  const outcomes: Record<CaseOutcome, number> = {
    improved: 0,
    worse: 0,
    same: 0,
    different: 0,
    error: 0,
  };

  const baselineAcc = newAccumulator();
  const withJevAcc = newAccumulator();
  const jevLatencies: number[] = [];
  let jevErrorCount = 0;
  let jevTokens = 0;
  let totalModelCalls = 0;

  for (const { testCase, result } of entries) {
    outcomes[result.comparison.outcome] += 1;
    const expected = testCase.expected;

    accumulatePath(baselineAcc, expected, {
      decision: result.baseline.decision,
      pathError: Boolean(result.baseline.error),
      latencyMs: result.baseline.totalLatencyMs,
      tokens: result.baseline.usage?.totalTokens,
      routeCorrect: result.comparison.baselineRouteCorrect,
    });
    accumulatePath(withJevAcc, expected, {
      decision: result.withJev.decision,
      pathError: Boolean(result.withJev.error),
      latencyMs: result.withJev.totalLatencyMs,
      tokens: result.withJev.reasoningUsage?.totalTokens,
      routeCorrect: result.comparison.withJevRouteCorrect,
    });

    const jev = result.withJev.jev;
    if (jev.error) {
      jevErrorCount += 1;
    } else if (!result.withJev.error || jev.signals) {
      // Jev succeeded even if the later reasoning step failed.
      jevLatencies.push(jev.latencyMs);
      jevTokens += jev.usage?.totalTokens ?? 0;
    }

    totalModelCalls += result.baseline.modelCalls + result.withJev.modelCalls;
  }

  return {
    caseCount: entries.length,
    outcomes,
    baseline: finalizePath(baselineAcc),
    withJev: finalizePath(withJevAcc),
    jev: {
      callCount: jevLatencies.length + jevErrorCount,
      errorCount: jevErrorCount,
      errorRate:
        jevLatencies.length + jevErrorCount > 0
          ? jevErrorCount / (jevLatencies.length + jevErrorCount)
          : null,
      avgLatencyMs: avg(jevLatencies),
      p50LatencyMs: percentile(jevLatencies, 50),
      p95LatencyMs: percentile(jevLatencies, 95),
      minLatencyMs: jevLatencies.length ? Math.min(...jevLatencies) : null,
      maxLatencyMs: jevLatencies.length ? Math.max(...jevLatencies) : null,
      totalTokens: jevTokens,
    },
    totalModelCalls,
  };
}
