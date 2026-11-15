/**
 * Single normalization layer: the UI never trusts provider shapes.
 * Missing (null) and actual zero (0) are NOT the same — missing renders "—".
 */

export function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** "12.4 mm" for real data, "—" for missing/invalid. Never crashes. */
export function formatPrecip(v: unknown): string {
  const n = toFiniteNumber(v);
  return n == null ? "—" : `${n.toFixed(1)} mm`;
}

/** Generic "12.4 suffix" / "—" formatter. */
export function formatNum(v: unknown, digits = 1, suffix = ""): string {
  const n = toFiniteNumber(v);
  return n == null ? "—" : `${n.toFixed(digits)}${suffix}`;
}

/** Safe 0–100 bar width. Never NaN/undefined/Infinity. */
export function barWidth(v: unknown, fullScale = 60): number {
  const n = toFiniteNumber(v);
  if (n == null) return 0;
  return Math.min(100, Math.max(0, (n / fullScale) * 100));
}

export type NwpStatus = "LIVE" | "RECENT" | "DELAYED" | "OFFLINE" | "DEMO" | "READY" | "AUTH";

export interface NwpUiModel {
  model: string;
  label: string;
  resolution: string;
  windowH: number | null;
  /** Null = provider did not supply a value. NOT zero. */
  precipMM: number | null;
  precipMM48: number | null;
  maxIntensityMMH: number | null;
  status: NwpStatus;
  dataMissing: boolean;
}

/**
 * Accepts both API shapes (/api/analysis uses precipMM24, /api/nwp uses
 * precipMM) plus string numerics. Never throws, never invents data.
 */
export function normalizeNwpModel(raw: unknown): NwpUiModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.model !== "string" || typeof r.label !== "string") return null;
  const status = (typeof r.status === "string" ? r.status : "OFFLINE") as NwpStatus;
  // Canonical field first, legacy analysis field second. Missing stays null.
  const precipMM = toFiniteNumber(r.precipMM ?? r.precipMM24);
  const dataMissing = status === "LIVE" && precipMM == null;
  return {
    model: r.model,
    label: r.label,
    resolution: typeof r.resolution === "string" ? r.resolution : "—",
    windowH: toFiniteNumber(r.windowH),
    precipMM,
    precipMM48: toFiniteNumber(r.precipMM48),
    maxIntensityMMH: toFiniteNumber(r.maxIntensityMMH ?? r.maxIntensity),
    status: dataMissing ? "LIVE" : status,
    dataMissing,
  };
}
