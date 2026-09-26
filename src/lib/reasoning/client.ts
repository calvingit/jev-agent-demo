import { classifyFetchError, httpError } from "../errors";
import type { ReasoningModelConfig, TokenUsage } from "../types";

/**
 * Reasoning model client: plain OpenAI-compatible Chat Completions over fetch.
 * No hidden retries. Kept fully separate from the Jev (System One) client.
 */

export type ReasoningCallResult =
  | { ok: true; content: string; usage?: TokenUsage; latencyMs: number; madeCall: true }
  | { ok: false; error: import("../types").RunError; latencyMs: number; madeCall: boolean };

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function mapUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as Record<string, unknown>;
  const input = typeof u.prompt_tokens === "number" ? u.prompt_tokens : undefined;
  const output = typeof u.completion_tokens === "number" ? u.completion_tokens : undefined;
  if (input === undefined && output === undefined) return undefined;
  const total =
    typeof u.total_tokens === "number"
      ? u.total_tokens
      : input !== undefined && output !== undefined
        ? input + output
        : undefined;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

export async function reasoningChat(
  config: ReasoningModelConfig,
  messages: ChatCompletionMessage[],
  temperature: number,
): Promise<ReasoningCallResult> {
  const started = performance.now();
  if (!config.apiKey) {
    return {
      ok: false,
      latencyMs: 0,
      madeCall: false,
      error: {
        type: "unknown",
        message:
          "未配置推理模型 API Key。请在服务端 .env 设置 OPENAI_API_KEY，或在“模型设置”中填写。",
      },
    };
  }

  const url = joinUrl(config.baseUrl, "chat/completions");
  let timedOut = false;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages, temperature }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        latencyMs: performance.now() - started,
        madeCall: true,
        error: httpError("推理模型", res.status, text),
      };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,
        latencyMs: performance.now() - started,
        madeCall: true,
        error: {
          type: "invalid_response",
          message: `推理模型返回了非 JSON 响应体：${text.slice(0, 200)}`,
        },
      };
    }
    const content = (data as Record<string, any>)?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        ok: false,
        latencyMs: performance.now() - started,
        madeCall: true,
        error: {
          type: "invalid_response",
          message: "推理模型响应缺少 choices[0].message.content 字符串",
        },
      };
    }
    return {
      ok: true,
      content,
      usage: mapUsage((data as Record<string, unknown>).usage),
      latencyMs: performance.now() - started,
      madeCall: true,
    };
  } catch (e) {
    return {
      ok: false,
      latencyMs: performance.now() - started,
      madeCall: true,
      error: classifyFetchError(e, "推理模型", timedOut),
    };
  } finally {
    clearTimeout(timer);
  }
}
