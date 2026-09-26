import type { BatchSummary } from "./metrics";
import type { BatchEntry } from "./metrics";
import type { ExperimentSnapshot } from "./types";

const SENSITIVE_KEY_RE = /(apikey|api_key|authorization|secret)/i;

/**
 * Defense in depth for exports (AC12 / doc §34): results and snapshots are
 * built without keys, and this strips anything key-like that might ever slip in.
 * Token usage fields (inputTokens / totalTokens / ...) are intentionally safe.
 */
export function sanitizeForExport<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForExport(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? "[REDACTED]" : sanitizeForExport(val);
    }
    return out as unknown as T;
  }
  return value;
}

export interface ExportPayload {
  experiment: ExperimentSnapshot;
  summary: BatchSummary;
  cases: Array<
    BatchEntry["result"] & {
      case: { id: string; name: string; messages: BatchEntry["testCase"]["messages"]; expected?: BatchEntry["testCase"]["expected"] };
    }
  >;
}

export function buildExportObject(
  snapshot: ExperimentSnapshot,
  summary: BatchSummary,
  entries: BatchEntry[],
): ExportPayload {
  return {
    experiment: sanitizeForExport(snapshot),
    summary: sanitizeForExport(summary),
    cases: entries.map(({ testCase, result }) =>
      sanitizeForExport({
        ...result,
        case: {
          id: testCase.id,
          name: testCase.name,
          messages: testCase.messages,
          expected: testCase.expected,
        },
      }),
    ),
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
