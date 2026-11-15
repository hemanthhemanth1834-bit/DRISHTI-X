"use client";
import { ShieldAlert } from "lucide-react";
import { ENGINE_LABEL, LEVEL_COLOR, WARNING_SYSTEM, WARNING_THRESHOLDS, type EngineOutput } from "@/lib/engine";
import { fmtIST } from "@/lib/format";

const BANDS: { level: string; from: number }[] = [
  { level: "NORMAL", from: WARNING_THRESHOLDS.NORMAL },
  { level: "WATCH", from: WARNING_THRESHOLDS.WATCH },
  { level: "ALERT", from: WARNING_THRESHOLDS.ALERT },
  { level: "SEVERE", from: WARNING_THRESHOLDS.SEVERE },
  { level: "EXTREME", from: WARNING_THRESHOLDS.EXTREME },
];

export default function WarningCard({
  label,
  accum,
  risk,
  live,
  validUntil,
}: {
  label: string;
  accum?: { h6: number };
  risk?: EngineOutput;
  live: boolean;
  validUntil?: string;
}) {
  if (!risk || !live) {
    return (
      <div className="panel warning">
        <ShieldAlert size={19} color="#8190a8" />
        <h3 style={{ marginTop: 12 }}>Early warning unavailable</h3>
        <p>SOURCE UNAVAILABLE — live inputs offline, no warning can be computed. Other panels keep last-known state.</p>
      </div>
    );
  }
  const color = LEVEL_COLOR[risk.level];
  return (
    <div className="panel warning" style={{ borderColor: `${color}55` }} role="alert" aria-label={`Early warning ${risk.level}`}>
      <ShieldAlert size={19} color={color} />
      <h3 style={{ marginTop: 12 }}>
        Early warning — <span style={{ color }}>{risk.level}</span>
      </h3>
      <dl className="warnGrid">
        <div><dt>Location</dt><dd>{label}</dd></div>
        <div><dt>Expected rainfall</dt><dd>{(accum?.h6 ?? 0).toFixed(1)} mm / 6h</dd></div>
        <div><dt>Inundation probability</dt><dd>{Math.round(risk.inundation.prob01 * 100)}% ({risk.inundation.class})</dd></div>
        <div><dt>Risk score</dt><dd>{risk.score} / 100</dd></div>
      </dl>
      <div className="progress"><span style={{ width: `${risk.score}%`, background: color }} /></div>
      <p className="prov">Why: {risk.drivers.join(" · ")}</p>
      <p className="prov">Bands: {BANDS.map((b) => `${b.level} ≥${b.from}`).join(" · ")} ({WARNING_SYSTEM})</p>
      {validUntil && <p className="prov">Valid until {fmtIST(validUntil)} · superseded by the next analysis refresh.</p>}
      <p className="proto">{ENGINE_LABEL} — AI-assisted analysis, not an official IMD warning.</p>
    </div>
  );
}
