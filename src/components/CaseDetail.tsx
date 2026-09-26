"use client";

import type { CaseResult, Expected, TestCase } from "@/lib/types";
import { boolLabel, intentLabel, routeLabel } from "@/lib/labels";
import { fmtPct } from "@/lib/format";
import { ResultPanels } from "./ResultPanels";
import { Badge, Modal } from "./ui";

export function ExpectedChips({ expected }: { expected: Expected }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
      <span className="font-medium text-slate-400">预期：</span>
      {expected.intents?.map((intent) => (
        <Badge key={intent} tone="slate" title={intent}>
          {intentLabel(intent)}
        </Badge>
      ))}
      {expected.route ? (
        <Badge tone={expected.route === "human" ? "amber" : "sky"}>
          路由：{routeLabel(expected.route)}
        </Badge>
      ) : null}
      {expected.needsHumanReview !== undefined ? (
        <Badge tone={expected.needsHumanReview ? "amber" : "slate"}>
          需人工审核：{boolLabel(expected.needsHumanReview)}
        </Badge>
      ) : null}
      {expected.frustrated !== undefined ? (
        <Badge tone={expected.frustrated ? "amber" : "slate"}>
          客户恼火：{boolLabel(expected.frustrated)}
        </Badge>
      ) : null}
      {expected.topicChanged !== undefined ? (
        <Badge tone={expected.topicChanged ? "purple" : "slate"}>
          话题切换：{boolLabel(expected.topicChanged)}
        </Badge>
      ) : null}
    </div>
  );
}

export function CaseDetail({
  testCase,
  result,
  onClose,
}: {
  testCase: TestCase | undefined;
  result: CaseResult | undefined;
  onClose: () => void;
}) {
  if (!testCase || !result) return null;
  const { baseline, withJev, comparison } = result;

  return (
    <Modal open wide onClose={onClose} title={`${testCase.name} · ${testCase.id}`}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          {testCase.messages.map((message, i) => (
            <div key={i}>
              <div className="text-sm">
                <span
                  className={
                    message.role === "user"
                      ? "mr-1.5 font-semibold text-slate-700"
                      : "mr-1.5 font-semibold text-slate-400"
                  }
                >
                  {message.role === "user" ? "用户" : "客服"}：
                </span>
                <span className="text-slate-600">{message.content}</span>
              </div>
              {message.translation ? (
                <div className="pl-1 text-xs text-slate-400">译：{message.translation}</div>
              ) : null}
            </div>
          ))}
        </div>

        {testCase.expected ? (
          <ExpectedChips expected={testCase.expected} />
        ) : (
          <div className="text-xs text-slate-400">
            该用例没有预期结果 —— 只能显示 相同 / 不同，无法给出 改善 / 变差 判断。
          </div>
        )}

        {comparison.hasGroundTruth ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>
              不加 Jev 路由{" "}
              <Badge tone={comparison.baselineRouteCorrect ? "emerald" : "red"}>
                {comparison.baselineRouteCorrect === null
                  ? "—"
                  : comparison.baselineRouteCorrect
                    ? "正确"
                    : "错误"}
              </Badge>
            </span>
            <span>
              加 Jev 路由{" "}
              <Badge tone={comparison.withJevRouteCorrect ? "emerald" : "red"}>
                {comparison.withJevRouteCorrect === null
                  ? "—"
                  : comparison.withJevRouteCorrect
                    ? "正确"
                    : "错误"}
              </Badge>
            </span>
            {comparison.baselineIntentsF1 !== null ? (
              <span className="tabular-nums">
                意图 F1 {fmtPct(comparison.baselineIntentsF1, 0)} →{" "}
                {fmtPct(comparison.withJevIntentsF1, 0)}
              </span>
            ) : null}
          </div>
        ) : null}

        <ResultPanels baseline={baseline} withJev={withJev} />
      </div>
    </Modal>
  );
}
