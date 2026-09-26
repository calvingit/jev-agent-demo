"use client";

import type { ChatMessage, Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/labels";
import { Button, cn } from "./ui";

export function ConversationEditor({
  messages,
  onChange,
  disabled,
}: {
  messages: ChatMessage[];
  onChange: (messages: ChatMessage[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<ChatMessage>) => {
    onChange(messages.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };
  const remove = (index: number) => {
    onChange(messages.filter((_, i) => i !== index));
  };
  const add = () => {
    const lastRole: Role = messages[messages.length - 1]?.role ?? "assistant";
    onChange([...messages, { role: lastRole === "user" ? "assistant" : "user", content: "" }]);
  };

  return (
    <div className="space-y-2">
      {messages.map((message, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-start gap-2">
            <select
              className={cn(
                "shrink-0 rounded-md border px-1.5 py-1.5 text-xs",
                message.role === "user"
                  ? "border-slate-300 bg-white text-slate-700"
                  : "border-slate-300 bg-slate-50 text-slate-500",
              )}
              value={message.role}
              disabled={disabled}
              onChange={(e) => update(index, { role: e.target.value as Role })}
            >
              <option value="user">{ROLE_LABELS.user}</option>
              <option value="assistant">{ROLE_LABELS.assistant}</option>
            </select>
            <textarea
              className="min-h-[38px] w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
              rows={Math.min(3, Math.max(1, Math.ceil(message.content.length / 60)))}
              placeholder="消息内容…"
              value={message.content}
              disabled={disabled}
              onChange={(e) => update(index, { content: e.target.value })}
            />
            <Button
              variant="ghost"
              className="shrink-0 px-2 text-slate-400 hover:text-red-600"
              disabled={disabled || messages.length === 1}
              onClick={() => remove(index)}
              title="删除消息"
            >
              ✕
            </Button>
          </div>
          {message.translation ? (
            <div className="pl-1 text-xs text-slate-400">译：{message.translation}</div>
          ) : null}
        </div>
      ))}
      <Button variant="secondary" onClick={add} disabled={disabled}>
        ＋ 添加消息
      </Button>
    </div>
  );
}
