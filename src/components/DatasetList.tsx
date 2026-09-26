"use client";

import { useState } from "react";
import type { DatasetMeta } from "@/lib/types";
import { ExpectedChips } from "./CaseDetail";
import { Badge, Button, Card, Modal } from "./ui";

function formatTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 数据集列表：内置数据集 + 每次导入的数据集。可切换使用、查看用例内容、
 * 删除导入的数据集。数据集仅保存在当前页面会话中。
 */
export function DatasetList({
  datasets,
  activeId,
  onSelect,
  onDelete,
}: {
  datasets: DatasetMeta[];
  activeId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = datasets.find((d) => d.id === viewingId);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          数据集（{datasets.length}）
        </span>
        <span className="text-xs text-slate-400">导入的数据集仅保存在当前页面中</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-400">
            <th className="py-1 text-left font-medium">名称</th>
            <th className="py-1 text-right font-medium">用例数</th>
            <th className="py-1 text-left font-medium">来源</th>
            <th className="py-1 text-left font-medium">加入时间</th>
            <th className="py-1 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {datasets.map((dataset) => {
            const active = dataset.id === activeId;
            return (
              <tr key={dataset.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-2 text-sm">
                  <span
                    className={
                      active ? "font-medium text-slate-900" : "text-slate-700"
                    }
                  >
                    {dataset.name}
                  </span>
                  {active ? (
                    <Badge tone="emerald" className="ml-1.5">
                      当前使用
                    </Badge>
                  ) : null}
                </td>
                <td className="py-1.5 px-2 text-right text-sm tabular-nums text-slate-700">
                  {dataset.cases.length}
                </td>
                <td className="py-1.5 px-2 text-sm">
                  {dataset.source === "builtin" ? (
                    <Badge tone="slate">内置</Badge>
                  ) : (
                    <Badge tone="sky">导入</Badge>
                  )}
                </td>
                <td className="py-1.5 px-2 text-sm tabular-nums text-slate-500">
                  {dataset.source === "builtin" ? "—" : formatTime(dataset.createdAt)}
                </td>
                <td className="py-1.5 pl-2 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    {active ? (
                      <span className="text-xs text-slate-300">使用中</span>
                    ) : (
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => onSelect(dataset.id)}>
                        使用
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="px-2 py-1 text-xs"
                      onClick={() => setViewingId(dataset.id)}
                    >
                      查看
                    </Button>
                    {dataset.source === "imported" ? (
                      <Button
                        variant="ghost"
                        className="px-1.5 py-1 text-xs text-slate-400 hover:text-red-600"
                        title="删除该数据集（仅内存状态）"
                        onClick={() => onDelete(dataset.id)}
                      >
                        ✕
                      </Button>
                    ) : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewingId(null)}
        wide
        title={viewing ? `${viewing.name} · ${viewing.cases.length} 条用例` : ""}
      >
        {viewing ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {viewing.cases.map((testCase) => (
              <div key={testCase.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {testCase.name}
                    <span className="ml-1.5 text-xs text-slate-400">{testCase.id}</span>
                  </span>
                  <span className="text-xs text-slate-400">{testCase.messages.length} 条消息</span>
                </div>
                <div className="space-y-1">
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
                  <div className="mt-2">
                    <ExpectedChips expected={testCase.expected} />
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-slate-400">无预期结果（只能显示 相同 / 不同）</div>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}
