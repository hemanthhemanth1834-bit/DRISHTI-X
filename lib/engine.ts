import type { SourceStatus } from "./locations";

export type WarningLevel = "NORMAL" | "WATCH" | "ALERT" | "SEVERE" | "EXTREME";
export type InundationClass = "LOW" | "MODERATE" | "HIGH" | "SEVERE";

/**
 * DRISHTI-X transparent risk prototype — a RULE/WEIGHTED-FUSION system,
 * NOT a trained machine-learning model. Labelled in-UI as
 * "Transparent AI-assisted prototype". Never an IMD operational warning.
 */
export const ENGINE_LABEL = "Transparent AI-assisted prototype";
export const ENGINE_NOTE =
  "Rule/weighted fusion over live inputs (rule/weighted fusion, not a trained ML model). Not an official IMD operational warning.";

export const WARNING_THRESHOLDS: Record<WarningLevel, number> = {
  NORMAL: 0,
  WATCH: 20,
  ALERT: 40,
  SEVERE: 60,
  EXTREME: 80,
};

export const WARNING_SYSTEM = "DRISHTI-X AI-assisted threshold (research; not IMD official thresholds)";

export interface FeatureDoc {
  feature: string;
  weight: number;
  source: string;
  unit: string;
  normalization: string;
  reason: string;
}

export const FEATURE_DOCS: FeatureDoc[] = [
  { feature: "Rainfall intensity", weight: 25, source: "Open-Meteo current.precipitation", unit: "mm/h", normalization: "x / 25, clamped 0–1", reason: "Instantaneous rate drives flash-flood onset" },
  { feature: "6-hour accumulation", weight: 20, source: "Open-Meteo hourly.precipitation (forecast)", unit: "mm / 6h", normalization: "x / 60, clamped 0–1", reason: "Short-window load overwhelms urban drainage" },
  { feature: "24-hour accumulation", weight: 15, source: "Open-Meteo hourly.precipitation (forecast)", unit: "mm / 24h", normalization: "x / 120, clamped 0–1", reason: "Day-scale saturation and river response" },
  { feature: "NWP consensus", weight: 12, source: "ECMWF IFS / GFS / ICON / GEM via Open-Meteo", unit: "mm, scaled by agreement", normalization: "(mean24 / 80) × (0.35 + 0.65 × agreement)", reason: "Multi-model agreement raises forecast trust" },
  { feature: "Precipitation probability", weight: 10, source: "Open-Meteo hourly.precipitation_probability", unit: "%", normalization: "max24h / 100", reason: "Likelihood qualifier on accumulations" },
  { feature: "Soil moisture", weight: 7, source: "Open-Meteo hourly.soil_moisture_3_9cm", unit: "m³/m³ (provider-native)", normalization: "(x − 0.12) / 0.30, clamped 0–1", reason: "Wet soils convert rain to runoff" },
  { feature: "Humidity", weight: 6, source: "Open-Meteo current.relative_humidity_2m", unit: "% RH", normalization: "(x − 55) / 45, clamped 0–1", reason: "Moist column sustains convection" },
  { feature: "Pressure anomaly", weight: 5, source: "Open-Meteo current.pressure_msl", unit: "hPa", normalization: "(1013 − x) / 18, clamped 0–1", reason: "Low-pressure systems accompany heavy rain" },
];

export const RISK_FORMULA =
  "Risk = Σ weightᵢ × normalized(inputᵢ); weights sum to 100. If a feature is unavailable, its weight is redistributed proportionally across available features and the redistribution is reported.";

export interface ModelRainInput {
  model: string;
  label: string;
  resolution: string;
  precipMM24: number;
  /** Canonical UI alias of precipMM24 (matches /api/nwp shape). */
  precipMM?: number;
  maxIntensityMMH: number;
  status: SourceStatus;
}

export interface EngineInput {
  rainRateMMH: number | null;
  accum1: number;
  accum3: number;
  accum6: number;
  accum12: number;
  accum24: number;
  accum48: number;
  antecedent24: number;
  precipProbMax: number | null;
  humidity: number | null;
  pressureMSL: number | null;
  soilMoisture: number | null;
  elevationM: number | null;
  agreement01: number;
  nwpMean24: number;
  radarStatus: SourceStatus;
}

export interface Contribution {
  feature: string;
  detail: string;
  weight: number;
  effectiveWeight: number;
  points: number;
  available: boolean;
}

export interface EngineOutput {
  score: number;
  level: WarningLevel;
  contributions: Contribution[];
  drivers: string[];
  renormalized: boolean;
  renormNote: string | null;
  inundation: {
    prob01: number;
    class: InundationClass;
    isEstimate: true;
    terrainNote: string;
    factors: { name: string; value: string }[];
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function levelFor(score: number): WarningLevel {
  if (score >= WARNING_THRESHOLDS.EXTREME) return "EXTREME";
  if (score >= WARNING_THRESHOLDS.SEVERE) return "SEVERE";
  if (score >= WARNING_THRESHOLDS.ALERT) return "ALERT";
  if (score >= WARNING_THRESHOLDS.WATCH) return "WATCH";
  return "NORMAL";
}

export function computeRisk(inp: EngineInput): EngineOutput {
  const avail = {
    intensity: inp.rainRateMMH != null,
    prob: inp.precipProbMax != null,
    soil: inp.soilMoisture != null,
    hum: inp.humidity != null,
    pres: inp.pressureMSL != null,
  };
  const missingW =
    (avail.intensity ? 0 : 25) + (avail.prob ? 0 : 10) + (avail.soil ? 0 : 7) + (avail.hum ? 0 : 6) + (avail.pres ? 0 : 5);
  const scale = missingW >= 100 ? 1 : 100 / (100 - missingW);
  const renormalized = missingW > 0;
  const renormNote = renormalized
    ? `Unavailable inputs (${[
        !avail.intensity && "intensity",
        !avail.prob && "probability",
        !avail.soil && "soil moisture",
        !avail.hum && "humidity",
        !avail.pres && "pressure",
      ]
        .filter(Boolean)
        .join(", ")}) excluded; remaining weights scaled ×${scale.toFixed(3)} so the score stays on a 0–100 scale. No fake values substituted.`
    : null;

  const intensityN = avail.intensity ? clamp01((inp.rainRateMMH as number) / 25) : 0;
  const a6N = clamp01(inp.accum6 / 60);
  const a24N = clamp01(inp.accum24 / 120);
  const probN = avail.prob ? clamp01((inp.precipProbMax as number) / 100) : 0;
  const nwpN = clamp01(inp.nwpMean24 / 80) * (0.35 + 0.65 * inp.agreement01);
  const humN = avail.hum ? clamp01(((inp.humidity as number) - 55) / 45) : 0;
  const soilN = avail.soil ? clamp01(((inp.soilMoisture as number) - 0.12) / 0.3) : 0;
  const presN = avail.pres ? clamp01((1013 - (inp.pressureMSL as number)) / 18) : 0;

  const base = [
    { feature: "Rainfall intensity", detail: avail.intensity ? `${(inp.rainRateMMH as number).toFixed(1)} mm/h now (Open-Meteo)` : "unavailable — weight redistributed", weight: 25, n: intensityN, ok: avail.intensity },
    { feature: "6-hour accumulation", detail: `${inp.accum6.toFixed(1)} mm / 6h (forecast sum)`, weight: 20, n: a6N, ok: true },
    { feature: "24-hour accumulation", detail: `${inp.accum24.toFixed(1)} mm / 24h (forecast sum)`, weight: 15, n: a24N, ok: true },
    { feature: "NWP consensus", detail: `mean ${inp.nwpMean24.toFixed(1)} mm, agreement ${Math.round(inp.agreement01 * 100)}%`, weight: 12, n: nwpN, ok: true },
    { feature: "Precipitation probability", detail: avail.prob ? `max ${Math.round(inp.precipProbMax as number)}% / 24h` : "unavailable — weight redistributed", weight: 10, n: probN, ok: avail.prob },
    { feature: "Soil moisture", detail: avail.soil ? `${(inp.soilMoisture as number).toFixed(3)} m³/m³ (provider-native)` : "unavailable — weight redistributed", weight: 7, n: soilN, ok: avail.soil },
    { feature: "Humidity", detail: avail.hum ? `${Math.round(inp.humidity as number)}% RH` : "unavailable — weight redistributed", weight: 6, n: humN, ok: avail.hum },
    { feature: "Pressure anomaly", detail: avail.pres ? `${Math.round(inp.pressureMSL as number)} hPa MSL` : "unavailable — weight redistributed", weight: 5, n: presN, ok: avail.pres },
  ];
  const rows: Contribution[] = base.map((r) => ({
    feature: r.feature,
    detail: r.detail,
    weight: r.weight,
    effectiveWeight: r.ok ? Math.round(r.weight * scale * 10) / 10 : 0,
    points: r.ok ? r.weight * scale * r.n : 0,
    available: r.ok,
  }));

  const score = Math.round(rows.reduce((s, r) => s + r.points, 0));
  const level = levelFor(score);
  const drivers = [...rows]
    .sort((a, b) => b.points - a.points)
    .slice(0, 4)
    .map((r) => (r.available ? r.feature : `${r.feature} (unavailable)`));

  const elevFactor = inp.elevationM == null ? 0.5 : clamp01((120 - inp.elevationM) / 120);
  const inund =
    0.42 * a24N + 0.22 * intensityN + 0.14 * soilN + 0.12 * clamp01(inp.antecedent24 / 80) + 0.1 * elevFactor;
  const prob01 = Math.round(inund * 100) / 100;
  const cls: InundationClass = prob01 >= 0.65 ? "SEVERE" : prob01 >= 0.45 ? "HIGH" : prob01 >= 0.25 ? "MODERATE" : "LOW";

  return {
    score,
    level,
    contributions: rows,
    drivers,
    renormalized,
    renormNote,
    inundation: {
      prob01,
      class: cls,
      isEstimate: true,
      terrainNote:
        inp.elevationM == null
          ? "Elevation unavailable — neutral terrain factor used. No DEM/slope/drainage inputs connected (see terrain interface)."
          : `Point elevation ${Math.round(inp.elevationM)} m (Open-Meteo). No DEM/slope/drainage inputs connected (see terrain interface).`,
      factors: [
        { name: "Forecast accumulation (24h)", value: `${inp.accum24.toFixed(1)} mm` },
        { name: "Antecedent rainfall (past 24h)", value: `${inp.antecedent24.toFixed(1)} mm` },
        { name: "Soil moisture", value: inp.soilMoisture == null ? "unavailable" : `${inp.soilMoisture.toFixed(3)} m³/m³` },
        { name: "Elevation", value: inp.elevationM == null ? "unavailable" : `${Math.round(inp.elevationM)} m` },
        { name: "Radar trend", value: inp.radarStatus === "LIVE" ? "frames available" : `radar ${inp.radarStatus}` },
      ],
    },
  };
}

/**
 * Statistical model agreement (NOT AI confidence, NOT an official product).
 * Documented formula over the identical-window totals of available models:
 *   spread = max − min
 *   agreement = max(0, 1 − spread / max(mean, AGREE_MIN_MM))
 * The floor (default 2 mm) keeps trace drizzle from reading as total
 * disagreement; all-dry models score 1. Requires ≥2 models, else 0.
 */
export const AGREE_MIN_MM = 2;

export function agreementOf(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const spread = Math.max(...xs) - Math.min(...xs);
  return clamp01(1 - spread / Math.max(mean, AGREE_MIN_MM));
}

export function spreadOf(values: number[]): number {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length < 2) return 0;
  return Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10;
}

/** Statistical model agreement — never labelled "AI confidence". */
export function consensusConfidence(nLive: number, spreadMM: number, meanMM: number): "LOW" | "MODERATE" | "HIGH" {
  if (nLive >= 3 && spreadMM <= Math.max(2, meanMM * 0.4)) return "HIGH";
  if (nLive >= 2 && spreadMM <= Math.max(8, meanMM)) return "MODERATE";
  return "LOW";
}

export const LEVEL_COLOR: Record<WarningLevel, string> = {
  NORMAL: "#3cff9a",
  WATCH: "#ffd166",
  ALERT: "#ffb454",
  SEVERE: "#ff6b86",
  EXTREME: "#ff3d5e",
};
