import assert from "node:assert/strict";
import test from "node:test";
import { compareCase } from "../src/lib/comparison";
import { BUILTIN_CASES } from "../src/lib/cases";
import { sanitizeForExport } from "../src/lib/export";
import { classifyFetchError, SchemaValidationError } from "../src/lib/errors";
import { extractSignals, toSignal } from "../src/lib/jev/evaluator";
import { normalizeTypesafeBaseUrl } from "../src/lib/jev/client";
import { parseCasesCsv, parseCasesJson } from "../src/lib/import";
import { avg, computeBatchSummary, intentsF1, percentile, sameSet } from "../src/lib/metrics";
import { buildSystemPrompt, PROMPT_VERSION } from "../src/lib/prompts";
import { parseReasoningOutput } from "../src/lib/reasoning/decision";
import { deriveRoute } from "../src/lib/routing";
import type {
  BaselineResult,
  CaseResult,
  ExperimentSnapshot,
  JevRunResult,
  TestCase,
  WithJevResult,
} from "../src/lib/types";

// ---------- Noul probability → boolean (doc §13) ----------

test("toSignal applies the 0.5 threshold", () => {
  assert.deepEqual(toSignal(0.98), { probability: 0.98, value: true });
  assert.deepEqual(toSignal(0.5), { probability: 0.5, value: true });
  assert.deepEqual(toSignal(0.49), { probability: 0.49, value: false });
  assert.deepEqual(toSignal(0.08), { probability: 0.08, value: false });
});

// ---------- Jev signals extraction (raw answers → signals) ----------

function noulAnswer(p: number) {
  return { type: "noul", noul: p };
}

test("extractSignals maps all ten Noul answers and keeps raw probabilities", () => {
  const raw = {
    intentProduct: noulAnswer(0.02),
    intentOrder: noulAnswer(0.31),
    intentLogistics: noulAnswer(0.98),
    intentRefund: noulAnswer(0.05),
    intentCancel: noulAnswer(0.94),
    intentPayment: noulAnswer(0.03),
    intentComplaint: noulAnswer(0.11),
    needsHumanReview: noulAnswer(0.97),
    frustrated: noulAnswer(0.13),
    topicChanged: noulAnswer(0.08),
  };
  const signals = extractSignals(raw);
  assert.equal(signals.intents.logistics.value, true);
  assert.equal(signals.intents.logistics.probability, 0.98);
  assert.equal(signals.intents.cancel.value, true);
  assert.equal(signals.intents.product.value, false);
  assert.equal(signals.needsHumanReview.value, true);
  assert.equal(signals.frustrated.value, false);
  assert.equal(signals.topicChanged.value, false);
});

test("extractSignals fails explicitly on a missing answer", () => {
  assert.throws(() => extractSignals({ intentProduct: noulAnswer(0.5) }), /缺少答案/);
});

test("extractSignals fails on out-of-range probability", () => {
  assert.throws(
    () => extractSignals({ ...emptyAnswers(), intentLogistics: noulAnswer(1.5) }),
    /Noul 概率非法/,
  );
});

function emptyAnswers(): Record<string, { type: string; noul: number }> {
  return {
    intentProduct: noulAnswer(0),
    intentOrder: noulAnswer(0),
    intentLogistics: noulAnswer(0),
    intentRefund: noulAnswer(0),
    intentCancel: noulAnswer(0),
    intentPayment: noulAnswer(0),
    intentComplaint: noulAnswer(0),
    needsHumanReview: noulAnswer(0),
    frustrated: noulAnswer(0),
    topicChanged: noulAnswer(0),
  };
}

// ---------- Routing policy (doc §17) ----------

test("deriveRoute escalates on needsHumanReview and refund/cancel intents", () => {
  assert.equal(deriveRoute(["logistics"], false), "agent");
  assert.equal(deriveRoute(["logistics"], true), "human");
  assert.equal(deriveRoute(["refund"], false), "human");
  assert.equal(deriveRoute(["cancel"], false), "human");
  assert.equal(deriveRoute(["logistics", "cancel"], false), "human");
  assert.equal(deriveRoute(["other"], false), "agent");
});

// ---------- Reasoning output parsing ----------

test("parseReasoningOutput accepts clean and fenced JSON", () => {
  const clean = '{"intents":["logistics","cancel"],"needsHumanReview":true,"response":"ok"}';
  assert.deepEqual(parseReasoningOutput(clean), {
    intents: ["logistics", "cancel"],
    needsHumanReview: true,
    response: "ok",
  });
  const fenced = "```json\n" + clean + "\n```";
  assert.deepEqual(parseReasoningOutput(fenced).intents, ["logistics", "cancel"]);
  // Deduplicates and tolerates surrounding text.
  const noisy = 'Sure! {"intents":["refund","refund"],"needsHumanReview":false,"response":"hi"}';
  assert.deepEqual(parseReasoningOutput(noisy).intents, ["refund"]);
});

test("parseReasoningOutput rejects invalid schema explicitly", () => {
  assert.throws(() => parseReasoningOutput("no json here"), SchemaValidationError);
  assert.throws(
    () => parseReasoningOutput('{"intents":["banana"],"needsHumanReview":true,"response":"x"}'),
    /未知意图/,
  );
  assert.throws(
    () => parseReasoningOutput('{"intents":["refund"],"response":"x"}'),
    /needsHumanReview/,
  );
  assert.throws(
    () => parseReasoningOutput('{"intents":["refund"],"needsHumanReview":true}'),
    /response/,
  );
});

// ---------- Comparison classification (doc §29) ----------

const okBaseline = (route: "agent" | "human", intents: string[]): BaselineResult => ({
  decision: { route, intents: intents as never, response: "r" },
  needsHumanReviewRaw: route === "human",
  reasoningLatencyMs: 100,
  totalLatencyMs: 100,
  modelCalls: 1,
  retryCount: 0,
});

const okWithJev = (route: "agent" | "human", intents: string[]): WithJevResult => ({
  jev: { latencyMs: 50, modelCalls: 1, retryCount: 0 } as JevRunResult,
  decision: { route, intents: intents as never, response: "r" },
  reasoningLatencyMs: 100,
  totalLatencyMs: 160,
  modelCalls: 2,
  retryCount: 0,
});

const errorBaseline: BaselineResult = {
  reasoningLatencyMs: 0,
  totalLatencyMs: 0,
  modelCalls: 1,
  retryCount: 0,
  error: { type: "http", message: "boom", status: 500 },
};

test("comparison: improved when baseline route wrong, with-Jev right", () => {
  const testCase: TestCase = {
    id: "t",
    name: "t",
    messages: [],
    expected: { route: "human", needsHumanReview: true },
  };
  const comparison = compareCase(
    testCase,
    okBaseline("agent", ["logistics"]),
    okWithJev("human", ["refund"]),
  );
  assert.equal(comparison.outcome, "improved");
});

test("comparison: worse when with-Jev breaks a correct route", () => {
  const testCase: TestCase = {
    id: "t",
    name: "t",
    messages: [],
    expected: { route: "human", needsHumanReview: true },
  };
  const comparison = compareCase(
    testCase,
    okBaseline("human", ["refund"]),
    okWithJev("agent", ["logistics"]),
  );
  assert.equal(comparison.outcome, "worse");
});

test("comparison: same and different with matching routes", () => {
  const testCase: TestCase = {
    id: "t",
    name: "t",
    messages: [],
    expected: { intents: ["logistics"], route: "agent", needsHumanReview: false },
  };
  const same = compareCase(testCase, okBaseline("agent", ["logistics"]), okWithJev("agent", ["logistics"]));
  assert.equal(same.outcome, "same");
  const different = compareCase(testCase, okBaseline("agent", ["order"]), okWithJev("agent", ["payment"]));
  assert.equal(different.outcome, "different");
});

test("comparison: any path error → error", () => {
  const testCase: TestCase = {
    id: "t",
    name: "t",
    messages: [],
    expected: { route: "agent" },
  };
  const comparison = compareCase(testCase, errorBaseline, okWithJev("agent", []));
  assert.equal(comparison.outcome, "error");
});

test("comparison without ground truth: only same/different, never improved/worse", () => {
  const testCase: TestCase = { id: "t", name: "t", messages: [] };
  const same = compareCase(testCase, okBaseline("agent", ["order"]), okWithJev("agent", ["order"]));
  assert.equal(same.outcome, "same");
  assert.equal(same.hasGroundTruth, false);
  const different = compareCase(testCase, okBaseline("agent", ["order"]), okWithJev("human", ["refund"]));
  assert.equal(different.outcome, "different");
});

// ---------- Intent metrics (doc §27) ----------

test("intentsF1 multi-label counting", () => {
  const prf = intentsF1(["logistics", "cancel", "payment"], ["logistics", "cancel", "complaint"]);
  // tp=2, fp=1, fn=1 → P=2/3, R=2/3, F1=2/3
  assert.ok(Math.abs(prf.precision - 2 / 3) < 1e-9);
  assert.ok(Math.abs(prf.recall - 2 / 3) < 1e-9);
  assert.ok(Math.abs(prf.f1 - 2 / 3) < 1e-9);
  assert.equal(intentsF1([], []).f1, 0);
});

test("sameSet is order-insensitive", () => {
  assert.ok(sameSet(["a", "b"] as never, ["b", "a"] as never));
  assert.ok(!sameSet(["a"] as never, ["a", "a"] as never));
});

// ---------- Percentiles / averages ----------

test("percentile uses linear interpolation", () => {
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5], 95), 5);
  const values = [100, 200, 300, 400];
  assert.equal(percentile(values, 50), 250);
  assert.equal(percentile(values, 95), 385);
  assert.equal(percentile(values, 0), 100);
  assert.equal(percentile(values, 100), 400);
  assert.equal(avg(values), 250);
});

// ---------- Batch summary ----------

function makeCaseResult(opts: {
  caseId: string;
  expected?: TestCase["expected"];
  baseline?: Partial<BaselineResult>;
  withJev?: Partial<WithJevResult>;
  jev?: Partial<JevRunResult>;
}): { testCase: TestCase; result: CaseResult } {
  const testCase: TestCase = {
    id: opts.caseId,
    name: opts.caseId,
    messages: [{ role: "user", content: "hello" }],
    expected: opts.expected,
  };
  const baseline: BaselineResult = {
    decision: { route: "agent", intents: ["other"], response: "" },
    needsHumanReviewRaw: false,
    reasoningLatencyMs: 1000,
    totalLatencyMs: 1000,
    usage: { totalTokens: 100 },
    modelCalls: 1,
    retryCount: 0,
    ...opts.baseline,
  };
  const jev: JevRunResult = {
    latencyMs: 200,
    usage: { totalTokens: 20 },
    modelCalls: 1,
    retryCount: 0,
    ...opts.jev,
  };
  const withJev: WithJevResult = {
    jev,
    decision: { route: "agent", intents: ["other"], response: "" },
    reasoningLatencyMs: 900,
    totalLatencyMs: 1150,
    reasoningUsage: { totalTokens: 90 },
    modelCalls: 2,
    retryCount: 0,
    ...opts.withJev,
  };
  const result: CaseResult = {
    caseId: opts.caseId,
    baseline,
    withJev,
    comparison: compareCase(testCase, baseline, withJev),
  };
  return { testCase, result };
}

test("computeBatchSummary: route accuracy, human recall, latency, tokens, errors", () => {
  const entries = [
    // both correct human → recall hit
    makeCaseResult({
      caseId: "c1",
      expected: { route: "human", needsHumanReview: true, intents: ["refund"] },
      baseline: { decision: { route: "human", intents: ["refund"], response: "" } },
      withJev: { decision: { route: "human", intents: ["refund"], response: "" } },
    }),
    // baseline misses human (agent), with-Jev catches it → improved
    makeCaseResult({
      caseId: "c2",
      expected: { route: "human", needsHumanReview: true, intents: ["cancel"] },
      baseline: { decision: { route: "agent", intents: ["logistics"], response: "" } },
      withJev: { decision: { route: "human", intents: ["cancel"], response: "" } },
    }),
    // baseline error
    makeCaseResult({
      caseId: "c3",
      expected: { route: "agent" },
      baseline: { error: { type: "timeout", message: "timed out" }, decision: undefined },
      withJev: { decision: { route: "agent", intents: ["other"], response: "" } },
      jev: { latencyMs: 300 },
    }),
  ];

  const summary = computeBatchSummary(entries);
  assert.equal(summary.caseCount, 3);
  assert.equal(summary.outcomes.improved, 1);
  assert.equal(summary.outcomes.error, 1);

  // Route accuracy: c1 both ok; c2 baseline wrong, wj right; c3 baseline errored.
  assert.equal(summary.baseline.routeJudgedCases, 2);
  assert.equal(summary.baseline.routeCorrectCases, 1);
  assert.ok(Math.abs(summary.baseline.routeAccuracy! - 0.5) < 1e-9);
  assert.equal(summary.withJev.routeJudgedCases, 3);
  assert.equal(summary.withJev.routeCorrectCases, 3);
  assert.ok(Math.abs(summary.withJev.routeAccuracy! - 1) < 1e-9);

  // Human review recall: 2 expected-human cases; baseline hit 1, withJev hit 2.
  assert.equal(summary.baseline.humanReviewCases, 2);
  assert.equal(summary.baseline.humanReviewHits, 1);
  assert.ok(Math.abs(summary.baseline.humanReviewRecall! - 0.5) < 1e-9);
  assert.ok(Math.abs(summary.withJev.humanReviewRecall! - 1) < 1e-9);

  // Latency: errored runs excluded.
  assert.equal(summary.baseline.avgTotalLatencyMs, 1000);
  assert.ok(Math.abs(summary.withJev.avgTotalLatencyMs! - (1150 + 1150 + 1150) / 3) < 1e-9);
  assert.equal(summary.jev.callCount, 3);
  assert.equal(summary.jev.errorCount, 0);
  assert.ok(Math.abs(summary.jev.avgLatencyMs! - (200 + 200 + 300) / 3) < 1e-9);
  assert.equal(summary.jev.minLatencyMs, 200);
  assert.equal(summary.jev.maxLatencyMs, 300);

  // Tokens: baseline 100+100 (c3 errored, excluded) = 200; withJev 90*3 = 270.
  assert.equal(summary.baseline.reasoningTokens, 200);
  assert.equal(summary.withJev.reasoningTokens, 270);
  assert.equal(summary.jev.totalTokens, 60);
  assert.equal(summary.totalModelCalls, 1 + 2 + 1 + 2 + 0 + 2 + 1);
  assert.equal(summary.baseline.errorCount, 1);
});

// ---------- Export sanitization (AC12) ----------

test("sanitizeForExport strips key-like fields, keeps token usage", () => {
  const snapshot: ExperimentSnapshot = {
    id: "b",
    startedAt: "now",
    jev: { baseUrl: "https://x", model: "m", noulThreshold: 0.5 },
    reasoning: { baseUrl: "https://y", model: "m" },
    temperature: 0,
    promptVersion: PROMPT_VERSION,
    caseCount: 1,
  };
  const dirty = {
    ...snapshot,
    apiKey: "secret",
    nested: { api_key: "secret2", Authorization: "Bearer x", totalTokens: 42 },
    list: [{ apiKey: "s", jevTokens: 7 }],
  };
  const clean = sanitizeForExport(dirty) as typeof dirty & { nested: Record<string, unknown> };
  assert.equal(clean.apiKey, "[REDACTED]");
  assert.equal(clean.nested.api_key, "[REDACTED]");
  assert.equal(clean.nested.Authorization, "[REDACTED]");
  assert.equal(clean.nested.totalTokens, 42);
  assert.equal((clean.list[0] as Record<string, unknown>).apiKey, "[REDACTED]");
  assert.equal((clean.list[0] as Record<string, unknown>).jevTokens, 7);
  assert.equal(clean.jev.baseUrl, "https://x");
});

// ---------- Error mapping ----------

test("classifyFetchError maps timeouts and network failures", () => {
  const timeout = classifyFetchError(
    new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    "Jev",
    false,
  );
  assert.equal(timeout.type, "timeout");
  const forced = classifyFetchError(new Error("aborted"), "Jev", true);
  assert.equal(forced.type, "timeout");
  const network = classifyFetchError(new TypeError("fetch failed"), "Reasoning model", false);
  assert.equal(network.type, "network");
});

// ---------- Import ----------

test("parseCasesJson accepts array and {cases} forms, validates intents", () => {
  const single = JSON.stringify([
    {
      id: "a",
      name: "A",
      messages: [{ role: "user", content: "hi" }],
      expected: { intents: ["logistics", "cancel"], route: "human", needsHumanReview: true },
    },
  ]);
  const parsed = parseCasesJson(single);
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].expected?.intents, ["logistics", "cancel"]);

  const wrapped = parseCasesJson(JSON.stringify({ cases: [{ id: "b", messages: [{ role: "assistant", content: "x" }] }] }));
  assert.equal(wrapped.length, 1);
  assert.equal(wrapped[0].expected, undefined);

  assert.throws(
    () => parseCasesJson('[{"id":"c","messages":[{"role":"user","content":"x"}],"expected":{"intents":["nope"]}}]'),
    /未知意图/,
  );
  assert.throws(() => parseCasesJson("[]"), /没有用例/);
});

test("parseCasesCsv groups multi-turn rows and reads expected columns", () => {
  const csv = [
    "id,name,role,content,expected_intents,expected_route,expected_needs_human_review,expected_frustrated,expected_topic_changed",
    'tc1,Topic change,user,"Where is my order #7788?",,,,,',
    'tc1,,assistant,"It arrives Friday.",,,,',
    'tc1,,user,"Also, refund the damaged item please.",refund,human,true,,true',
    'tc2,Refund,user,"I want a refund.",refund,human,true,,',
  ].join("\n");
  const cases = parseCasesCsv(csv);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].messages.length, 3);
  assert.deepEqual(cases[0].expected, {
    intents: ["refund"],
    route: "human",
    needsHumanReview: true,
    topicChanged: true,
  });
  assert.deepEqual(cases[1].expected, { intents: ["refund"], route: "human", needsHumanReview: true });
});

test("parseCasesCsv handles quoted commas", () => {
  const csv = 'id,name,role,content\nx1,Test,user,"Hello, world, again"';
  const cases = parseCasesCsv(csv);
  assert.equal(cases[0].messages[0].content, "Hello, world, again");
});

// ---------- Jev base URL normalization ----------

test("normalizeTypesafeBaseUrl strips full System One endpoint", () => {
  assert.equal(normalizeTypesafeBaseUrl("https://api.typesafe.ai/v1/systemone"), "https://api.typesafe.ai");
  assert.equal(normalizeTypesafeBaseUrl("https://api.typesafe.ai/"), "https://api.typesafe.ai");
  assert.equal(normalizeTypesafeBaseUrl("https://api.typesafe.ai"), "https://api.typesafe.ai");
});

// ---------- Prompt fairness (doc §16) ----------

test("baseline and with-Jev prompts share the base; only the signals block differs", () => {
  const base = buildSystemPrompt();
  const withSignals = buildSystemPrompt({
    intents: {
      product: toSignal(0.1),
      order: toSignal(0.2),
      logistics: toSignal(0.9),
      refund: toSignal(0.1),
      cancel: toSignal(0.8),
      payment: toSignal(0.1),
      complaint: toSignal(0.1),
    },
    needsHumanReview: toSignal(0.9),
    frustrated: toSignal(0.2),
    topicChanged: toSignal(0.1),
  });
  assert.ok(withSignals.startsWith(base));
  assert.ok(withSignals.includes("pre-classifier"));
  assert.ok(base.includes('{"intents"'));
});

// ---------- Built-in dataset sanity ----------

test("built-in cases are internally consistent with the shared routing policy", () => {
  assert.ok(BUILTIN_CASES.length >= 10 && BUILTIN_CASES.length <= 20);
  for (const testCase of BUILTIN_CASES) {
    assert.ok(testCase.messages.length > 0, testCase.id);
    const expected = testCase.expected;
    if (!expected) continue;
    if (expected.route && typeof expected.needsHumanReview === "boolean") {
      assert.equal(
        deriveRoute(expected.intents ?? [], expected.needsHumanReview),
        expected.route,
        `policy mismatch in ${testCase.id}`,
      );
    }
  }
});
