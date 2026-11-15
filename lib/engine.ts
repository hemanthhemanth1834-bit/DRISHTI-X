import type { SourceStatus } from "./locations";

export type WarningLevel = "NORMAL" | "WATCH" | "ALERT" | "SEVERE" | "EXTREME";
export type InundationClass = "UNKNOWN" | "LOW" | "MODERATE" | "HIGH" | "SEVERE";

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
  { feature: "Rainfall intensity", weight: 25, source: "Open-Meteo current.precipitationMM15 → ×4 rate", unit: "mm/h", normalization: "x / 25, clamped 0–1", reason: "15-minute amount converted to rate drives flash-flood onset" },
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
  /** Null when the model did not supply a complete 24h window. Never zero-filled. */
  precipMM24: number | null;
  /** Canonical UI alias of precipMM24 (matches /api/nwp shape). */
  precipMM?: number | null;
  maxIntensityMMH: number | null;
  status: SourceStatus;
}

export interface EngineInput {
  rainRateMMH: number | null;
  accum1: number | null;
  accum3: number | null;
  accum6: number | null;
  accum12: number | null;
  accum24: number | null;
  accum48: number | null;
  antecedent24: number | null;
  precipProbMax: number | null;
  humidity: number | null;
  pressureMSL: number | null;
  soilMoisture: number | null;
  elevationM: number | null;
  agreement01: number | null;
  nwpMean24: number | null;
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
  /** Share of the 100-point feature weight actually available this run. */
  coverage01: number;
  contributions: Contribution[];
  drivers: string[];
  renormalized: boolean;
  renormNote: string | null;
  inundation: {
    /** Uncalibrated 0–100 heuristic; NOT a probability. */
    riskIndex: number;
    /** Share of inundation-factor weight available. 0 => UNKNOWN. */
    coverage01: number;
    class: InundationClass;
    isEstimate: true;
    terrainNote: string;
    factors: { name: string; value: string }[];
    factorsNote?: string;
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
    a6: inp.accum6 != null,
    a24: inp.accum24 != null,
    nwp: inp.nwpMean24 != null,
    prob: inp.precipProbMax != null,
    soil: inp.soilMoisture != null,
    hum: inp.humidity != null,
    pres: inp.pressureMSL != null,
  };
  const weights = { intensity: 25, a6: 20, a24: 15, nwp: 12, prob: 10, soil: 7, hum: 6, pres: 5 };
  const labels: Record<keyof typeof weights, string> = {
    intensity: "intensity",
    a6: "6h accumulation",
    a24: "24h accumulation",
    nwp: "NWP consensus",
    prob: "probability",
    soil: "soil moisture",
    hum: "humidity",
    pres: "pressure",
  };
  const availableWeight = (Object.keys(weights) as (keyof typeof weights)[])
    .filter((k) => avail[k])
    .reduce((s, k) => s + weights[k], 0);
  const scale = availableWeight > 0 ? 100 / availableWeight : 0;
  const missing = (Object.keys(weights) as (keyof typeof weights)[]).filter((k) => !avail[k]);
  const renormalized = missing.length > 0;
  const renormNote =
    availableWeight === 0
      ? "No weighted inputs available — the risk score is not computed (coverage 0%). No fake values substituted."
      : renormalized
        ? `Unavailable inputs (${missing.map((k) => labels[k]).join(", ")}) excluded; remaining weights scaled ×${scale.toFixed(3)} so the score stays on a 0–100 scale. No fake values substituted.`
        : null;

  const intensityN = avail.intensity ? clamp01((inp.rainRateMMH as number) / 25) : 0;
  const a6N = avail.a6 ? clamp01((inp.accum6 as number) / 60) : 0;
  const a24N = avail.a24 ? clamp01((inp.accum24 as number) / 120) : 0;
  const agreement = inp.agreement01;
  // Agreement is only defined with ≥2 models. When it is unavailable, use the
  // real mean without inventing a discount; the contribution detail discloses
  // that consensus could not be assessed.
  const nwpN = avail.nwp
    ? clamp01((inp.nwpMean24 as number) / 80) * (agreement == null ? 1 : 0.35 + 0.65 * clamp01(agreement))
    : 0;
  const probN = avail.prob ? clamp01((inp.precipProbMax as number) / 100) : 0;
  const humN = avail.hum ? clamp01(((inp.humidity as number) - 55) / 45) : 0;
  const soilN = avail.soil ? clamp01(((inp.soilMoisture as number) - 0.12) / 0.3) : 0;
  const presN = avail.pres ? clamp01((1013 - (inp.pressureMSL as number)) / 18) : 0;

  const unavailable = "unavailable — incomplete/missing input; weight redistributed";
  const base = [
    { feature: "Rainfall intensity", detail: avail.intensity ? `${(inp.rainRateMMH as number).toFixed(1)} mm/h now (model-derived)` : unavailable, weight: 25, n: intensityN, ok: avail.intensity },
    { feature: "6-hour accumulation", detail: avail.a6 ? `${(inp.accum6 as number).toFixed(1)} mm / 6h (forecast sum)` : "incomplete 6h window — unavailable; weight redistributed", weight: 20, n: a6N, ok: avail.a6 },
    { feature: "24-hour accumulation", detail: avail.a24 ? `${(inp.accum24 as number).toFixed(1)} mm / 24h (forecast sum)` : "incomplete 24h window — unavailable; weight redistributed", weight: 15, n: a24N, ok: avail.a24 },
    {
      feature: "NWP consensus",
      detail: avail.nwp
        ? `mean ${(inp.nwpMean24 as number).toFixed(1)} mm, agreement ${agreement == null ? "unavailable (single model — no consensus adjustment)" : `${Math.round(agreement * 100)}%`}`
        : unavailable,
      weight: 12,
      n: nwpN,
      ok: avail.nwp,
    },
    { feature: "Precipitation probability", detail: avail.prob ? `max ${Math.round(inp.precipProbMax as number)}% / 24h` : unavailable, weight: 10, n: probN, ok: avail.prob },
    { feature: "Soil moisture", detail: avail.soil ? `${(inp.soilMoisture as number).toFixed(3)} m³/m³ (provider-native)` : unavailable, weight: 7, n: soilN, ok: avail.soil },
    { feature: "Humidity", detail: avail.hum ? `${Math.round(inp.humidity as number)}% RH` : unavailable, weight: 6, n: humN, ok: avail.hum },
    { feature: "Pressure anomaly", detail: avail.pres ? `${Math.round(inp.pressureMSL as number)} hPa MSL` : unavailable, weight: 5, n: presN, ok: avail.pres },
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
  const drivers = rows
    .filter((r) => r.available)
    .sort((a, b) => b.points - a.points)
    .slice(0, 4)
    .map((r) => r.feature);
  if (drivers.length === 0) drivers.push("Insufficient data");

  // Inundation heuristic: renamed to an uncalibrated risk index. Every factor
  // is optional; weights are redistributed over what is actually available and
  // coverage is disclosed. No probability interpretation is permitted.
  const iWeights = { a24: 42, intensity: 22, soil: 14, antecedent: 12, elev: 10 };
  const iAvail = {
    a24: inp.accum24 != null,
    intensity: inp.rainRateMMH != null,
    soil: inp.soilMoisture != null,
    antecedent: inp.antecedent24 != null,
    elev: inp.elevationM != null,
  };
  const iTotal = (Object.keys(iWeights) as (keyof typeof iWeights)[])
    .filter((k) => iAvail[k])
    .reduce((s, k) => s + iWeights[k], 0);
  const iCoverage = iTotal / 100;
  const elevFactor = iAvail.elev ? clamp01((120 - (inp.elevationM as number)) / 120) : 0;
  const iScore = iTotal === 0 ? 0 : Math.round(
    (42 * (iAvail.a24 ? a24N : 0) +
      22 * (iAvail.intensity ? intensityN : 0) +
      14 * (iAvail.soil ? soilN : 0) +
      12 * (iAvail.antecedent ? clamp01((inp.antecedent24 as number) / 80) : 0) +
      10 * elevFactor) /
      iTotal *
      100
  );
  const cls: InundationClass =
    iTotal === 0 ? "UNKNOWN" : iScore >= 65 ? "SEVERE" : iScore >= 45 ? "HIGH" : iScore >= 25 ? "MODERATE" : "LOW";
  const iMissing = (Object.keys(iWeights) as (keyof typeof iWeights)[]).filter((k) => !iAvail[k]);

  return {
    score,
    level,
    coverage01: Math.round((availableWeight / 100) * 100) / 100,
    contributions: rows,
    drivers,
    renormalized,
    renormNote,
    inundation: {
      riskIndex: iScore,
      coverage01: Math.round(iCoverage * 100) / 100,
      class: cls,
      isEstimate: true,
      terrainNote:
        inp.elevationM == null
          ? "Elevation unavailable — terrain factor excluded and weight redistributed. Point DEM context is not used for depth; no slope/flow/drainage model is connected."
          : `Point elevation ${Math.round(inp.elevationM)} m (Open-Meteo). Point DEM context only; no slope/flow/drainage model is connected, so no flood depth or extent is computed.`,
      factors: [
        { name: "Forecast accumulation (24h)", value: iAvail.a24 ? `${(inp.accum24 as number).toFixed(1)} mm` : "unavailable (weight redistributed)" },
        { name: "Antecedent rainfall (past 24h)", value: iAvail.antecedent ? `${(inp.antecedent24 as number).toFixed(1)} mm` : "unavailable (weight redistributed)" },
        { name: "Soil moisture", value: iAvail.soil ? `${(inp.soilMoisture as number).toFixed(3)} m³/m³` : "unavailable (weight redistributed)" },
        { name: "Elevation", value: iAvail.elev ? `${Math.round(inp.elevationM as number)} m` : "unavailable (weight redistributed)" },
        { name: "Radar trend", value: inp.radarStatus === "LIVE" ? "frames available" : `radar ${inp.radarStatus}` },
      ],
      ...(iMissing.length > 0
        ? { factorsNote: `Unavailable inundation factors: ${iMissing.join(", ")}. Weights redistributed; coverage ${Math.round(iCoverage * 100)}%.` }
        : {}),
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
