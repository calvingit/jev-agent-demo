import type { RunError, RunErrorType } from "./types";

export function runError(type: RunErrorType, message: string, status?: number): RunError {
  return status === undefined ? { type, message } : { type, message, status };
}

export class SchemaValidationError extends Error {
  readonly errorType: RunErrorType = "schema_validation";

  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

export function toSchemaError(e: unknown): RunError {
  if (e instanceof SchemaValidationError) {
    return runError("schema_validation", e.message);
  }
  return runError("unknown", e instanceof Error ? e.message : String(e));
}

function errProps(e: unknown): { name?: string; message?: string; status?: unknown } {
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    return {
      name: typeof obj.name === "string" ? obj.name : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
      status: obj.status,
    };
  }
  return {};
}

/**
 * Map a TypeSafe SDK error (APITimeoutError / APIConnectionError / APIError / ...)
 * to a RunError without losing the HTTP status.
 */
export function classifySdkError(e: unknown): RunError {
  const { name, message, status } = errProps(e);
  const msg = message || String(e);
  switch (name) {
    case "APITimeoutError":
      return runError("timeout", msg);
    case "APIUserAbortError":
      return runError("timeout", `Request aborted: ${msg}`);
    case "APIConnectionError":
      return runError("network", msg);
    default:
      break;
  }
  if (typeof status === "number") {
    return runError("http", msg, status);
  }
  return runError("unknown", msg);
}

/**
 * Map a raw fetch() failure to a RunError. `label` prefixes the message
 * (e.g. "Jev", "推理模型").
 */
export function classifyFetchError(e: unknown, label: string, timedOut: boolean): RunError {
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return runError("timeout", `${label}请求超时`);
  }
  if (timedOut) {
    return runError("timeout", `${label}请求超时`);
  }
  if (e instanceof TypeError) {
    return runError("network", `${label}连接失败：${e.message}`);
  }
  return runError("unknown", e instanceof Error ? e.message : String(e));
}

export function httpError(label: string, status: number, bodyText: string): RunError {
  const snippet = bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
  return runError("http", `${label} HTTP ${status}: ${snippet}`, status);
}
