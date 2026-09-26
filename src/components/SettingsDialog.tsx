"use client";

import { useState } from "react";
import type { ClientConfig, ServerDefaults } from "@/lib/types";
import { Button, Field, Modal, TextInput } from "./ui";

/**
 * 模型设置（AC2）。此处输入的密钥只存在于 React state：随单次请求发送到本应用
 * 自己的后端，不会被持久化、记录或导出。留空的字段回退到服务端 .env 默认值。
 */
export function SettingsDialog({
  open,
  config,
  serverDefaults,
  onClose,
  onSave,
}: {
  open: boolean;
  config: ClientConfig;
  serverDefaults: ServerDefaults | null;
  onClose: () => void;
  onSave: (config: ClientConfig) => void;
}) {
  const [draft, setDraft] = useState<ClientConfig>(config);

  const jevDefault = serverDefaults?.jev;
  const reasoningDefault = serverDefaults?.reasoning;

  return (
    <Modal open={open} onClose={onClose} title="模型设置">
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            Jev · TypeSafe System One（快速语义判断）
          </h3>
          <div className="space-y-3">
            <Field
              label="接口地址（Base URL）"
              hint={jevDefault ? `服务端默认：${jevDefault.baseUrl}` : undefined}
            >
              <TextInput
                value={draft.jev.baseUrl}
                placeholder={jevDefault?.baseUrl ?? "https://api.typesafe.ai"}
                onChange={(e) => setDraft({ ...draft, jev: { ...draft.jev, baseUrl: e.target.value } })}
              />
            </Field>
            <Field
              label="API 密钥（API Key）"
              hint={
                jevDefault?.hasKey
                  ? "已在服务端 .env 配置默认密钥 —— 留空即使用默认"
                  : "服务端未配置密钥 —— 此项必填"
              }
            >
              <TextInput
                type="password"
                value={draft.jev.apiKey}
                placeholder={jevDefault?.hasKey ? "••••••••（使用服务端默认）" : "apikey_…"}
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, jev: { ...draft.jev, apiKey: e.target.value } })}
              />
            </Field>
            <Field label="模型 ID" hint={jevDefault ? `服务端默认：${jevDefault.model}` : undefined}>
              <TextInput
                value={draft.jev.model}
                placeholder={jevDefault?.model ?? "jev-latest"}
                onChange={(e) => setDraft({ ...draft, jev: { ...draft.jev, model: e.target.value } })}
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">
            推理模型 · OpenAI 兼容接口
          </h3>
          <div className="space-y-3">
            <Field
              label="接口地址（Base URL）"
              hint={reasoningDefault ? `服务端默认：${reasoningDefault.baseUrl}` : undefined}
            >
              <TextInput
                value={draft.reasoning.baseUrl}
                placeholder={reasoningDefault?.baseUrl ?? "https://api.deepseek.com"}
                onChange={(e) =>
                  setDraft({ ...draft, reasoning: { ...draft.reasoning, baseUrl: e.target.value } })
                }
              />
            </Field>
            <Field
              label="API 密钥（API Key）"
              hint={
                reasoningDefault?.hasKey
                  ? "已在服务端 .env 配置默认密钥 —— 留空即使用默认"
                  : "服务端未配置密钥 —— 此项必填"
              }
            >
              <TextInput
                type="password"
                value={draft.reasoning.apiKey}
                placeholder={reasoningDefault?.hasKey ? "••••••••（使用服务端默认）" : "sk-…"}
                autoComplete="off"
                onChange={(e) =>
                  setDraft({ ...draft, reasoning: { ...draft.reasoning, apiKey: e.target.value } })
                }
              />
            </Field>
            <Field
              label="模型 ID"
              hint={reasoningDefault ? `服务端默认：${reasoningDefault.model}` : undefined}
            >
              <TextInput
                value={draft.reasoning.model}
                placeholder={reasoningDefault?.model ?? "deepseek-chat"}
                onChange={(e) =>
                  setDraft({ ...draft, reasoning: { ...draft.reasoning, model: e.target.value } })
                }
              />
            </Field>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">通用设置</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="温度（Temperature）" hint="仅作用于推理模型">
              <TextInput
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onChange={(e) =>
                  setDraft({ ...draft, temperature: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="请求超时（毫秒）" hint="同时作用于两个模型">
              <TextInput
                type="number"
                min={1}
                step={500}
                value={draft.timeoutMs}
                onChange={(e) => setDraft({ ...draft, timeoutMs: Number(e.target.value) })}
              />
            </Field>
          </div>
        </section>

        <p className="text-xs text-slate-400">
          密钥只随单次请求发送到本应用自己的后端 —— 不存储、不打日志、不进导出。两个模型均已禁用
          重试，保证延迟与错误率测量真实。
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  );
}
