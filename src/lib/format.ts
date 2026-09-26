export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** Signed difference in percentage points, e.g. "+4.2 pp". */
export function fmtDeltaPp(ratioA: number | null, ratioB: number | null): string | null {
  if (ratioA === null || ratioB === null) return null;
  const delta = (ratioB - ratioA) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pp`;
}

export function fmtDeltaMs(msA: number | null, msB: number | null): string | null {
  if (msA === null || msB === null) return null;
  const delta = msB - msA;
  return `${delta <= 0 ? "" : "+"}${fmtMs(Math.abs(delta))} ${delta <= 0 ? "更快" : "更慢"}`;
}

export function fmtDeltaInt(a: number | null, b: number | null): string | null {
  if (a === null || b === null) return null;
  const delta = b - a;
  return `${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString("en-US")}`;
}
