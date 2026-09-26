"use client";

import { useState } from "react";
import type { ChatMessage, ClientConfig, EvaluateResponse } from "@/lib/types";
import { EXAMPLE_CONVERSATION } from "@/lib/cases";
import { ConversationEditor } from "./ConversationEditor";
import { ResultPanels } from "./ResultPanels";
import { Button, Card, ErrorBox } from "./ui";

export function SingleTest({ config }: { config: ClientConfig }) {
  const [messages, setMessages] = useState<ChatMessage[]>(EXAMPLE_CONVERSATION);
  const [running, setRunning] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluateResponse | null>(null);

  const canRun = messages.some((m) => m.content.trim().length > 0) && !running;

  const run = async () => {
    setRunning(true);
    setRequestError(null);
    setResult(null);
    try {
      const res = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: messages.filter((m) => m.content.trim().length > 0),
          config,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `请求失败（HTTP ${res.status}）`);
      }
      setResult((await res.json()) as EvaluateResponse);
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            对话内容
          </span>
          <Button variant="ghost" onClick={() => setMessages(EXAMPLE_CONVERSATION)}>
            恢复示例对话
          </Button>
        </div>
        <ConversationEditor messages={messages} onChange={setMessages} disabled={running} />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={run} disabled={!canRun}>
            {running ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                正在运行两条路径…
              </>
            ) : (
              "运行"
            )}
          </Button>
          <span className="text-xs text-slate-400">
            不加 Jev / 加 Jev 两条路径对同一对话并行运行。
          </span>
        </div>
      </Card>

      {requestError ? <ErrorBox title="请求失败">{requestError}</ErrorBox> : null}

      {result ? <ResultPanels baseline={result.baseline} withJev={result.withJev} /> : null}
    </div>
  );
}
