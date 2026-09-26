"use client";

import { useEffect, useState } from "react";
import { SettingsDialog } from "@/components/SettingsDialog";
import { BatchTest } from "@/components/BatchTest";
import { SingleTest } from "@/components/SingleTest";
import { cn } from "@/components/ui";
import {
  DEFAULT_JEV_BASE_URL,
  DEFAULT_JEV_MODEL,
  DEFAULT_REASONING_BASE_URL,
  DEFAULT_REASONING_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_TIMEOUT_MS,
} from "@/lib/defaults";
import type { ClientConfig, ServerDefaults } from "@/lib/types";

const INITIAL_CONFIG: ClientConfig = {
  jev: { baseUrl: DEFAULT_JEV_BASE_URL, apiKey: "", model: DEFAULT_JEV_MODEL },
  reasoning: { baseUrl: DEFAULT_REASONING_BASE_URL, apiKey: "", model: DEFAULT_REASONING_MODEL },
  temperature: DEFAULT_TEMPERATURE,
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

function KeyDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="flex items-center gap-1 text-xs text-slate-500"
      title={ok ? `${label}已配置` : `未配置${label}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-400")} />
      {label}
    </span>
  );
}

export default function Page() {
  const [tab, setTab] = useState<"single" | "batch">("single");
  const [config, setConfig] = useState<ClientConfig>(INITIAL_CONFIG);
  const [serverDefaults, setServerDefaults] = useState<ServerDefaults | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetch("/api/config-defaults")
      .then((res) => (res.ok ? res.json() : null))
      .then((defaults: ServerDefaults | null) => {
        if (!defaults) return;
        setServerDefaults(defaults);
        setConfig((prev) => ({
          ...prev,
          jev: {
            ...prev.jev,
            baseUrl: prev.jev.baseUrl === DEFAULT_JEV_BASE_URL ? defaults.jev.baseUrl : prev.jev.baseUrl,
            model: prev.jev.model === DEFAULT_JEV_MODEL ? defaults.jev.model : prev.jev.model,
          },
          reasoning: {
            ...prev.reasoning,
            baseUrl:
              prev.reasoning.baseUrl === DEFAULT_REASONING_BASE_URL
                ? defaults.reasoning.baseUrl
                : prev.reasoning.baseUrl,
            model:
              prev.reasoning.model === DEFAULT_REASONING_MODEL
                ? defaults.reasoning.model
                : prev.reasoning.model,
          },
          timeoutMs: prev.timeoutMs === DEFAULT_TIMEOUT_MS ? defaults.timeoutMs : prev.timeoutMs,
        }));
      })
      .catch(() => undefined);
  }, []);

  const jevKeyOk = Boolean(config.jev.apiKey) || Boolean(serverDefaults?.jev.hasKey);
  const reasoningKeyOk = Boolean(config.reasoning.apiKey) || Boolean(serverDefaults?.reasoning.hasKey);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <h1 className="text-base font-semibold">Jev Feasibility Lab</h1>
          <nav className="flex rounded-md bg-slate-100 p-0.5">
            {(
              [
                ["single", "单条测试"],
                ["batch", "批量测试"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium transition-colors",
                  tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-3">
              <KeyDot ok={jevKeyOk} label="Jev 密钥" />
              <KeyDot ok={reasoningKeyOk} label="推理模型密钥" />
            </div>
            <button
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              onClick={() => setSettingsOpen(true)}
            >
              模型设置
            </button>
          </div>
        </div>
      </header>

      {serverDefaults && !jevKeyOk && !reasoningKeyOk ? (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            尚未配置任何 API Key。请在「模型设置」中填写，或在服务端 .env 设置 JEV_API_KEY /
            OPENAI_API_KEY。
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-4">
        {tab === "single" ? <SingleTest config={config} /> : <BatchTest config={config} />}
      </main>

      <SettingsDialog
        key={settingsOpen ? "settings-open" : "settings-closed"}
        open={settingsOpen}
        config={config}
        serverDefaults={serverDefaults}
        onClose={() => setSettingsOpen(false)}
        onSave={setConfig}
      />
    </div>
  );
}
