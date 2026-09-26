"use client";

import { useMemo, useRef, useState } from "react";
import { BUILTIN_CASES } from "@/lib/cases";
import { compareCase } from "@/lib/comparison";
import { buildExportObject, downloadJson } from "@/lib/export";
import { fmtDeltaInt, fmtDeltaMs, fmtDeltaPp, fmtInt, fmtMs, fmtPct } from "@/lib/format";
import { ImportFormatError, parseCasesCsv, parseCasesJson } from "@/lib/import";
import { OUTCOME_LABELS, routeLabel } from "@/lib/labels";
import { computeBatchSummary, type BatchEntry } from "@/lib/metrics";
import { PROMPT_VERSION } from "@/lib/prompts";
import {
  type CaseOutcome,
  type CaseResult,
  type ClientConfig,
  type DatasetMeta,
  type ExperimentSnapshot,
  type TestCase,
} from "@/lib/types";
import { NOUL_THRESHOLD } from "@/lib/jev/evaluator";
import { CaseDetail } from "./CaseDetail";
import { DatasetList } from "./DatasetList";
import { Badge, Button, Card, ErrorBox, cn, type BadgeTone } from "./ui";

type OutcomeFilter = "all" | CaseOutcome;

const BUILTIN_DATASET: DatasetMeta = {
  id: "builtin",
  name: "内置数据集",
  source: "builtin",
  createdAt: "",
  cases: BUILTIN_CASES,
};

const OUTCOME_TONES: Record<CaseOutcome, BadgeTone> = {
  improved: "emerald",
  worse: "red",
  same: "slate",
  different: "purple",
  error: "red",
};

const FILTERS: Array<{ key: OutcomeFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "improved", label: "改善" },
  { key: "worse", label: "变差" },
  { key: "same", label: "相同" },
  { key: "different", label: "不同" },
  { key: "error", label: "错误" },
];

const PASTE_EXAMPLE =
  '[{"id":"case-1","name":"示例用例","messages":[{"role":"user","content":"我的包裹到哪了？"}],"expected":{"intents":["logistics"]}}]';

function SummaryRow({
  label,
  without,
  withJev,
  delta,
  deltaTone,
  sub,
}: {
  label: string;
  without: string;
  withJev: string;
  delta: string | null;
  deltaTone: "good" | "bad" | "neutral";
  sub?: string;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-1.5 pr-2 text-sm text-slate-600">
        {label}
        {sub ? <span className="ml-1 text-xs text-slate-400">{sub}</span> : null}
      </td>
      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-800">{without}</td>
      <td className="py-1.5 px-2 text-right text-sm font-medium tabular-nums text-slate-900">
        {withJev}
      </td>
      <td
        className={cn(
          "py-1.5 pl-2 text-right text-sm tabular-nums",
          deltaTone === "good" && "text-emerald-600",
          deltaTone === "bad" && "text-red-600",
          deltaTone === "neutral" && "text-slate-500",
        )}
      >
        {delta ?? "—"}
      </td>
    </tr>
  );
}

export function BatchTest({ config }: { config: ClientConfig }) {
  const [datasets, setDatasets] = useState<DatasetMeta[]>([BUILTIN_DATASET]);
  const [activeDatasetId, setActiveDatasetId] = useState("builtin");
  const [datasetName, setDatasetName] = useState("");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState<1 | 2 | 4 | 8>(4);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, success: 0, error: 0 });
  const [snapshot, setSnapshot] = useState<ExperimentSnapshot | null>(null);
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [detailCaseId, setDetailCaseId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeDataset = datasets.find((d) => d.id === activeDatasetId) ?? datasets[0];
  const cases = activeDataset.cases;
  const caseById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);

  const clearRunState = () => {
    setResults([]);
    setSnapshot(null);
    setDetailCaseId(null);
  };

  const addDataset = (parsed: TestCase[], name?: string) => {
    const meta: DatasetMeta = {
      id: `ds-${Date.now()}`,
      name: name?.trim() || `导入 ${parsed.length} 条用例`,
      source: "imported",
      createdAt: new Date().toISOString(),
      cases: parsed,
    };
    setDatasets((prev) => [...prev, meta]);
    setActiveDatasetId(meta.id);
    clearRunState();
    setImportText("");
    setDatasetName("");
    setImportError(null);
  };

  const selectDataset = (id: string) => {
    setActiveDatasetId(id);
    clearRunState();
  };

  const deleteDataset = (id: string) => {
    setDatasets((prev) => prev.filter((d) => d.id !== id));
    if (id === activeDatasetId) {
      setActiveDatasetId("builtin");
      clearRunState();
    }
  };

  const loadImportText = () => {
    setImportError(null);
    const text = importText.trim();
    if (!text) {
      setImportError("请先粘贴 JSON 或 CSV 文本。");
      return;
    }
    try {
      const parsed =
        text.startsWith("[") || text.startsWith("{") ? parseCasesJson(text) : parseCasesCsv(text);
      addDataset(parsed, datasetName);
    } catch (e) {
      setImportError(
        e instanceof ImportFormatError
          ? e.message
          : `导入失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const onImportFile = async (file: File) => {
    setImportError(null);
    const text = await file.text();
    setImportText(text);
    try {
      const parsed = file.name.toLowerCase().endsWith(".csv")
        ? parseCasesCsv(text)
        : parseCasesJson(text);
      addDataset(parsed, file.name.replace(/\.(json|csv)$/i, ""));
    } catch (e) {
      setImportError(
        e instanceof ImportFormatError
          ? e.message
          : `导入失败：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const runBatch = async () => {
    const nextSnapshot: ExperimentSnapshot = {
      id: `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      startedAt: new Date().toISOString(),
      jev: {
        baseUrl: config.jev.baseUrl,
        model: config.jev.model,
        noulThreshold: NOUL_THRESHOLD,
      },
      reasoning: { baseUrl: config.reasoning.baseUrl, model: config.reasoning.model },
      temperature: config.temperature,
      promptVersion: PROMPT_VERSION,
      caseCount: cases.length,
    };
    setSnapshot(nextSnapshot);
    setResults([]);
    setProgress({ done: 0, success: 0, error: 0 });
    setRunning(true);
    setDetailCaseId(null);

    let cursor = 0;
    let success = 0;
    let error = 0;

    const runOne = async (testCase: TestCase) => {
      let caseResult: CaseResult;
      try {
        const res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: testCase.id,
            messages: testCase.messages,
            expected: testCase.expected,
            config,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        caseResult = {
          caseId: testCase.id,
          baseline: data.baseline,
          withJev: data.withJev,
          comparison: data.comparison,
        };
      } catch (e) {
        // 失败的是我们自己的 API 请求（模型调用的错误都在结果内带出）。
        const message = e instanceof Error ? e.message : String(e);
        const runnerError = {
          type: "network" as const,
          message: `批量请求失败：${message}`,
        };
        const failedBaseline = {
          reasoningLatencyMs: 0,
          totalLatencyMs: 0,
          modelCalls: 0,
          retryCount: 0,
          error: runnerError,
        };
        const failedWithJev = {
          jev: { latencyMs: 0, modelCalls: 0, retryCount: 0 },
          totalLatencyMs: 0,
          modelCalls: 0,
          retryCount: 0,
          error: runnerError,
        };
        caseResult = {
          caseId: testCase.id,
          baseline: failedBaseline,
          withJev: failedWithJev,
          comparison: compareCase(testCase, failedBaseline, failedWithJev),
        };
      }

      if (caseResult.baseline.error || caseResult.withJev.error) error += 1;
      else success += 1;
      setResults((prev) => [...prev, caseResult]);
      setProgress({ done: success + error, success, error });
    };

    const workers = Array.from({ length: Math.min(concurrency, cases.length) }, async () => {
      while (cursor < cases.length) {
        const testCase = cases[cursor];
        cursor += 1;
        await runOne(testCase);
      }
    });
    await Promise.all(workers);
    setRunning(false);
  };

  const entries: BatchEntry[] = useMemo(
    () =>
      results
        .map((result) => {
          const testCase = caseById.get(result.caseId);
          return testCase ? { testCase, result } : null;
        })
        .filter((entry): entry is BatchEntry => entry !== null),
    [results, caseById],
  );
  const summary = useMemo(() => computeBatchSummary(entries), [entries]);

  const exportJson = () => {
    if (!snapshot) return;
    const payload = buildExportObject(snapshot, summary, entries);
    downloadJson(`jev-batch-${snapshot.id}.json`, payload);
  };

  const filteredResults =
    filter === "all" ? results : results.filter((r) => r.comparison.outcome === filter);
  const detailTestCase = detailCaseId ? caseById.get(detailCaseId) : undefined;
  const detailResult = detailCaseId ? results.find((r) => r.caseId === detailCaseId) : undefined;

  const latencyDelta = fmtDeltaMs(
    summary.baseline.avgTotalLatencyMs,
    summary.withJev.avgTotalLatencyMs,
  );
  const p95Delta = fmtDeltaMs(summary.baseline.p95TotalLatencyMs, summary.withJev.p95TotalLatencyMs);
  const tokensDelta = fmtDeltaInt(summary.baseline.reasoningTokens, summary.withJev.reasoningTokens);

  return (
    <div className="space-y-4">
      {/* 数据集列表 */}
      <DatasetList
        datasets={datasets}
        activeId={activeDatasetId}
        onSelect={selectDataset}
        onDelete={deleteDataset}
      />

      {/* 控制区 */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="text-xs text-slate-500">
            当前数据集：
            <span className="font-medium text-slate-800">{activeDataset.name}</span>
            <span className="ml-1 text-slate-400">（{cases.length} 条用例）</span>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-slate-600">并发数</div>
            <select
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) as 1 | 2 | 4 | 8)}
              disabled={running}
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={runBatch} disabled={running || cases.length === 0}>
            {running ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                运行中…
              </>
            ) : (
              `运行 ${cases.length} 条用例`
            )}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
            >
              导入文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,text/csv,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportFile(file);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={exportJson} disabled={!snapshot || running}>
              导出 JSON
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-600">
            或直接粘贴用例（JSON 数组 / {"{"}cases:[…]{'}'} / CSV，表头{" "}
            <code className="text-[11px]">
              id,name,role,content,expected_intents,expected_route,…
            </code>
            ）
          </div>
          <textarea
            className="h-20 w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 font-mono text-xs focus:border-slate-500 focus:outline-none"
            placeholder={PASTE_EXAMPLE}
            value={importText}
            disabled={running}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
              placeholder="数据集名称（可选）"
              value={datasetName}
              disabled={running}
              onChange={(e) => setDatasetName(e.target.value)}
            />
            <Button variant="secondary" onClick={loadImportText} disabled={running}>
              载入为新数据集
            </Button>
          </div>
          {importError ? (
            <div className="mt-2">
              <ErrorBox title="导入错误">{importError}</ErrorBox>
            </div>
          ) : null}
        </div>
      </Card>

      {/* 进度 */}
      {running || progress.done > 0 ? (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {running
                ? `运行中 ${progress.done} / ${cases.length}`
                : `已完成 ${progress.done} / ${cases.length}`}
            </span>
            <span className="text-slate-500">
              成功：<span className="font-medium text-emerald-600">{progress.success}</span>
              {" · "}
              错误：<span className="font-medium text-red-600">{progress.error}</span>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-800 transition-all"
              style={{ width: `${cases.length ? (progress.done / cases.length) * 100 : 0}%` }}
            />
          </div>
        </Card>
      ) : null}

      {/* 汇总 */}
      {entries.length > 0 ? (
        <>
          <Card className="p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              汇总
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1 text-left font-medium">指标</th>
                  <th className="py-1 px-2 text-right font-medium">不加 Jev</th>
                  <th className="py-1 px-2 text-right font-medium">加 Jev</th>
                  <th className="py-1 pl-2 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                <SummaryRow
                  label="意图 F1"
                  sub="（微平均）"
                  without={fmtPct(summary.baseline.intentF1, 1)}
                  withJev={fmtPct(summary.withJev.intentF1, 1)}
                  delta={fmtDeltaPp(summary.baseline.intentF1, summary.withJev.intentF1)}
                  deltaTone={cmpTone(summary.baseline.intentF1, summary.withJev.intentF1)}
                />
                <SummaryRow
                  label="路由准确率"
                  without={fmtPct(summary.baseline.routeAccuracy, 1)}
                  withJev={fmtPct(summary.withJev.routeAccuracy, 1)}
                  delta={fmtDeltaPp(summary.baseline.routeAccuracy, summary.withJev.routeAccuracy)}
                  deltaTone={cmpTone(summary.baseline.routeAccuracy, summary.withJev.routeAccuracy)}
                />
                <SummaryRow
                  label="人工审核召回率"
                  sub={`（${summary.withJev.humanReviewCases} 条用例）`}
                  without={fmtPct(summary.baseline.humanReviewRecall, 1)}
                  withJev={fmtPct(summary.withJev.humanReviewRecall, 1)}
                  delta={fmtDeltaPp(
                    summary.baseline.humanReviewRecall,
                    summary.withJev.humanReviewRecall,
                  )}
                  deltaTone={cmpTone(
                    summary.baseline.humanReviewRecall,
                    summary.withJev.humanReviewRecall,
                  )}
                />
                <SummaryRow
                  label="平均总延迟"
                  without={fmtMs(summary.baseline.avgTotalLatencyMs)}
                  withJev={fmtMs(summary.withJev.avgTotalLatencyMs)}
                  delta={latencyDelta}
                  deltaTone={latencyTone(
                    summary.baseline.avgTotalLatencyMs,
                    summary.withJev.avgTotalLatencyMs,
                  )}
                />
                <SummaryRow
                  label="P95 总延迟"
                  without={fmtMs(summary.baseline.p95TotalLatencyMs)}
                  withJev={fmtMs(summary.withJev.p95TotalLatencyMs)}
                  delta={p95Delta}
                  deltaTone={latencyTone(
                    summary.baseline.p95TotalLatencyMs,
                    summary.withJev.p95TotalLatencyMs,
                  )}
                />
                <SummaryRow
                  label="推理 Token 数"
                  without={fmtInt(summary.baseline.reasoningTokens)}
                  withJev={fmtInt(summary.withJev.reasoningTokens)}
                  delta={tokensDelta}
                  deltaTone={tokensTone(
                    summary.baseline.reasoningTokens,
                    summary.withJev.reasoningTokens,
                  )}
                />
                <SummaryRow
                  label="错误数"
                  without={`${summary.baseline.errorCount}`}
                  withJev={`${summary.withJev.errorCount}`}
                  delta={fmtDeltaInt(summary.baseline.errorCount, summary.withJev.errorCount)}
                  deltaTone={errorTone(summary.withJev.errorCount, summary.baseline.errorCount)}
                />
              </tbody>
            </table>
            <div className="mt-2 flex gap-4 text-xs text-slate-400">
              <span>
                结果分布：改善 {summary.outcomes.improved} · 变差 {summary.outcomes.worse} · 相同{" "}
                {summary.outcomes.same} · 不同 {summary.outcomes.different} · 错误{" "}
                {summary.outcomes.error}
              </span>
              <span>模型调用总数：{summary.totalModelCalls}</span>
            </div>
          </Card>

          {/* Jev 延迟 */}
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Jev 延迟
              </span>
              <span className="text-xs text-slate-400">
                共 {summary.jev.callCount} 次调用 · Token {fmtInt(summary.jev.totalTokens)} · 错误率{" "}
                {fmtPct(summary.jev.errorRate, 1)}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {(
                [
                  ["平均", summary.jev.avgLatencyMs],
                  ["P50", summary.jev.p50LatencyMs],
                  ["P95", summary.jev.p95LatencyMs],
                  ["最小", summary.jev.minLatencyMs],
                  ["最大", summary.jev.maxLatencyMs],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-md bg-slate-50 p-2.5">
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                    {fmtMs(value)}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* 用例明细 */}
          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                用例明细
              </span>
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map(({ key, label }) => {
                  const count =
                    key === "all" ? results.length : summary.outcomes[key as CaseOutcome];
                  return (
                    <button
                      key={key}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        filter === key
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                      )}
                      onClick={() => setFilter(key)}
                    >
                      {label}（{count}）
                    </button>
                  );
                })}
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-1 text-left font-medium">用例</th>
                  <th className="py-1 text-left font-medium">结果</th>
                  <th className="py-1 text-right font-medium">Jev</th>
                  <th className="py-1 text-right font-medium">基线总耗时</th>
                  <th className="py-1 text-right font-medium">加 Jev 总耗时</th>
                  <th className="py-1 text-right font-medium">Token（基线 → 加 Jev）</th>
                  <th className="py-1 text-left font-medium">路由</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((result) => {
                  const testCase = caseById.get(result.caseId);
                  return (
                    <tr
                      key={result.caseId}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setDetailCaseId(result.caseId)}
                    >
                      <td className="py-1.5 pr-2 text-sm">
                        <div className="font-medium text-slate-800">
                          {testCase?.name ?? result.caseId}
                        </div>
                        <div className="text-xs text-slate-400">{result.caseId}</div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge tone={OUTCOME_TONES[result.comparison.outcome]}>
                          {OUTCOME_LABELS[result.comparison.outcome]}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-700">
                        {result.withJev.jev.error ? "—" : fmtMs(result.withJev.jev.latencyMs)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-700">
                        {fmtMs(result.baseline.totalLatencyMs)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-700">
                        {fmtMs(result.withJev.totalLatencyMs)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-700">
                        {fmtInt(result.baseline.usage?.totalTokens)} →{" "}
                        {fmtInt(result.withJev.reasoningUsage?.totalTokens)}
                      </td>
                      <td className="py-1.5 pl-2 text-sm text-slate-600">
                        {result.baseline.decision
                          ? routeLabel(result.baseline.decision.route)
                          : "—"}{" "}
                        →{" "}
                        {result.withJev.decision
                          ? routeLabel(result.withJev.decision.route)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredResults.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">没有符合筛选条件的用例。</div>
            ) : null}
            <div className="mt-2 text-xs text-slate-400">
              点击任意用例查看完整左右对比详情。
            </div>
          </Card>
        </>
      ) : null}

      <CaseDetail
        testCase={detailTestCase}
        result={detailResult}
        onClose={() => setDetailCaseId(null)}
      />
    </div>
  );
}

function cmpTone(a: number | null, b: number | null): "good" | "bad" | "neutral" {
  if (a === null || b === null || Math.abs(b - a) < 1e-9) return "neutral";
  return b > a ? "good" : "bad";
}

function latencyTone(a: number | null, b: number | null): "good" | "bad" | "neutral" {
  if (a === null || b === null || Math.abs(b - a) < 1e-9) return "neutral";
  return b < a ? "good" : "bad";
}

function tokensTone(a: number, b: number): "good" | "bad" | "neutral" {
  if (a === b) return "neutral";
  return b < a ? "good" : "bad";
}

function errorTone(withJevErrors: number, baselineErrors: number): "good" | "bad" | "neutral" {
  if (withJevErrors === baselineErrors) return "neutral";
  return withJevErrors < baselineErrors ? "good" : "bad";
}
