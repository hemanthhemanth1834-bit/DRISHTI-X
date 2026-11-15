/**
 * Plausibility gates for Open-Meteo values (documented physical ranges).
 * A value outside range is treated as MISSING (never silently used):
 * the risk engine then renormalizes weights and discloses it.
 */
export interface FieldCheck {
  field: string;
  ok: boolean;
  note: string;
}

const RANGES: Record<string, [number, number, string]> = {
  temperature: [-60, 60, "°C"],
  humidity: [0, 100, "% RH"],
  pressure: [800, 1100, "hPa"],
  windSpeed: [0, 150, "km/h"],
  rainRate: [0, 300, "mm/h"],
  cloudCover: [0, 100, "%"],
  soilMoisture: [0, 0.6, "m³/m³"],
};

export function checkField(field: string, v: number | null): FieldCheck {
  const r = RANGES[field];
  if (v == null) return { field, ok: false, note: "missing from provider" };
  if (!r) return { field, ok: true, note: "no gate defined" };
  const ok = v >= r[0] && v <= r[1];
  return { field, ok, note: ok ? `${v} ${r[2]} within [${r[0]}, ${r[1]}]` : `${v} ${r[2]} outside [${r[0]}, ${r[1]}] — excluded` };
}

export function qualityReport(values: Record<string, number | null>): { checks: FieldCheck[]; suspect: string[] } {
  const checks = Object.entries(values).map(([k, v]) => checkField(k, v));
  return { checks, suspect: checks.filter((c) => !c.ok).map((c) => c.field) };
}
