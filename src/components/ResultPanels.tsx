"use client";

import type { BaselineResult, Intent, JevIntent, Route, WithJevResult } from "@/lib/types";
import { boolLabel, ERROR_TYPE_LABELS, intentLabel, routeLabel, SIGNAL_LABELS } from "@/lib/labels";
import { fmtInt, fmtMs } from "@/lib/format";
import { Badge, Card, ErrorBox, cn } from "./ui";

function RouteBadge({ route }: { route: Route }) {
  return route === "human" ? (
    <Badge tone="amber">{routeLabel(route)}</Badge>
  ) : (
    <Badge tone="sky">{routeLabel(route)}</Badge>
  );
}

function IntentBadges({ intents }: { intents: Intent[] }) {
  if (intents.length === 0) return <span className="text-xs text-slate-400">无</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {intents.map((intent) => (
        <Badge key={intent} tone="slate" title={intent}>
          {intentLabel(intent)}
        </Badge>
      ))}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function SignalRow({ label, probability }: { label: string; probability: number }) {
  const yes = probability >= 0.5;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-24 shrink-0 text-xs text-slate-600">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", yes ? "bg-teal-500" : "bg-slate-300")}
          style={{ width: `${Math.max(2, Math.round(probability * 100))}%` }}
        />
      </div>
      <span
        className={cn(
          "w-10 shrink-0 text-right text-xs font-medium tabular-nums",
          yes ? "text-teal-700" : "text-slate-500",
        )}
      >
        {(probability * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function JevSignalsSection({ withJev }: { withJev: WithJevResult }) {
  const jev = withJev.jev;
  if (jev.error || !jev.signals) {
    return (
      <ErrorBox title="Jev 出错 —— 未产生信号（不伪造数据）">
        {jev.error
          ? `${ERROR_TYPE_LABELS[jev.error.type]}：${jev.error.message}`
          : "Jev 未返回信号"}
      </ErrorBox>
    );
  }
  const signals = jev.signals;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Jev 语义信号
      </div>
      {SIGNAL_LABELS.map(({ key, label }) => {
        const probability = key.startsWith("intent.")
          ? signals.intents[key.slice(7) as JevIntent].probability
          : signals[key as "needsHumanReview" | "frustrated" | "topicChanged"].probability;
        return <SignalRow key={key} label={label} probability={probability} />;
      })}
    </div>
  );
}

export function ResultPanels({
  baseline,
  withJev,
}: {
  baseline: BaselineResult;
  withJev: WithJevResult;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* 不加 Jev */}
      <Card className="flex flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            不加 Jev
          </span>
          {baseline.decision ? <RouteBadge route={baseline.decision.route} /> : null}
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              意图
            </div>
            {baseline.decision ? (
              <IntentBadges intents={baseline.decision.intents} />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>

          {typeof baseline.needsHumanReviewRaw === "boolean" ? (
            <div className="text-xs text-slate-400">
              模型自评需人工审核：
              <span className="font-medium text-slate-600">
                {boolLabel(baseline.needsHumanReviewRaw)}
              </span>{" "}
              · 路由由共享策略派生
            </div>
          ) : null}

          {baseline.error ? (
            <ErrorBox title={`${ERROR_TYPE_LABELS[baseline.error.type]}`}>
              {baseline.error.message}
              {baseline.error.status ? `（HTTP ${baseline.error.status}）` : ""}
            </ErrorBox>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              回复
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 text-sm text-slate-700">
              {baseline.decision?.response ?? "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-2">
          <StatRow label="推理耗时" value={fmtMs(baseline.reasoningLatencyMs)} />
          <StatRow label="总耗时" value={fmtMs(baseline.totalLatencyMs)} />
          <StatRow label="Token 数" value={fmtInt(baseline.usage?.totalTokens)} />
          <StatRow label="调用次数" value={baseline.modelCalls} />
        </div>
      </Card>

      {/* 加 Jev */}
      <Card className="flex flex-col p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            加 Jev
          </span>
          {withJev.decision ? <RouteBadge route={withJev.decision.route} /> : null}
        </div>

        <div className="space-y-3">
          <JevSignalsSection withJev={withJev} />

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              意图
            </div>
            {withJev.decision ? (
              <IntentBadges intents={withJev.decision.intents} />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>

          {withJev.jev.signals ? (
            <div className="text-xs text-slate-400">
              路由由共享策略派生：Jev 判断需人工审核 ={" "}
              <span className="font-medium text-slate-600">
                {boolLabel(withJev.jev.signals.needsHumanReview.value)}
              </span>{" "}
              ＋ 意图
            </div>
          ) : null}

          {withJev.error && !withJev.jev.error ? (
            <ErrorBox title={`${ERROR_TYPE_LABELS[withJev.error.type]}`}>
              {withJev.error.message}
              {withJev.error.status ? `（HTTP ${withJev.error.status}）` : ""}
            </ErrorBox>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              回复
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2.5 text-sm text-slate-700">
              {withJev.decision?.response ?? "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-2">
          <StatRow label="Jev 耗时" value={fmtMs(withJev.jev.latencyMs)} />
          <StatRow label="推理耗时" value={fmtMs(withJev.reasoningLatencyMs)} />
          <StatRow label="总耗时" value={fmtMs(withJev.totalLatencyMs)} />
          <StatRow label="Token 数" value={fmtInt(withJev.reasoningUsage?.totalTokens)} />
          <StatRow
            label="调用次数（Jev＋推理）"
            value={`${withJev.modelCalls}（${withJev.jev.modelCalls} + ${withJev.modelCalls - withJev.jev.modelCalls}）`}
          />
        </div>
      </Card>
    </div>
  );
}
