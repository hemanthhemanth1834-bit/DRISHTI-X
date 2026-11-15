"use client";
import { BellRing, MapPin, ShieldAlert } from "lucide-react";
import { LEVEL_COLOR, WARNING_SYSTEM, WARNING_THRESHOLDS } from "@/lib/engine";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import { fmtIST } from "@/lib/format";

const LEVELS = ["NORMAL", "WATCH", "ALERT", "SEVERE", "EXTREME"] as const;

const SAFETY: string[] = [
  "Avoid low-lying areas, underpasses and river banks during the validity window.",
  "Keep emergency kit ready: documents, water, torch, power bank, medicines.",
  "Follow official district administration / IMD advisories — this system is research-grade and issues no emergency notifications.",
  "If water rises, move to higher ground early; do not cross flooded roads on foot or vehicle.",
];

export default function AlertDetails({
  analysis,
  live,
  label,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
}) {
  const risk = live ? analysis?.risk : undefined;
  const w = analysis?.warning;
  const color = risk ? LEVEL_COLOR[risk.level] : "#8190a8";

  if (!risk || !live) {
    return (
      <div className="panel">
        <div className="metricLabel">Alert details</div>
        <p className="unavail">ALERT DETAILS UNAVAILABLE — live inputs offline. No alert can be derived without live data (no cached or simulated alerts are shown).</p>
      </div>
    );
  }

  const band = LEVELS.map((l) => `${l} ≥${WARNING_THRESHOLDS[l]}`).join(" · ");
  return (
    <div className="panel alertDetail">
      <div className="sectionHead" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 19 }}>Alert details</h2>
          <p>{WARNING_SYSTEM}</p>
        </div>
        <BellRing color={color} />
      </div>
      <div className="alertSev">
        <ShieldAlert size={16} color={color} />
        <b style={{ color }}>{risk.level}</b>
        <span className="prov" style={{ margin: 0 }}>score {risk.score}/100</span>
      </div>
      <dl className="factGrid" style={{ marginTop: 10 }}>
        <div><dt><MapPin size={10} style={{ verticalAlign: -1 }} /> Area</dt><dd>{label} ({analysis?.lat?.toFixed(2)}, {analysis?.lon?.toFixed(2)})</dd></div>
        <div><dt>Trigger</dt><dd>{(analysis?.accum?.h6 ?? 0).toFixed(1)} mm / 6h forecast accumulation · bands: {band}</dd></div>
        <div><dt>Issued</dt><dd>{w?.validFrom ? `${fmtIST(w.validFrom)}` : fmtIST(analysis?.fetchedAt ?? "")}</dd></div>
        <div><dt>Valid until</dt><dd>{w?.validUntil ? `${fmtIST(w.validUntil)}` : "—"} (3h validity, superseded on refresh)</dd></div>
        <div>
          <dt>Confidence</dt>
          <dd>
            NWP consensus {analysis?.consensus ?? "—"} · agreement {Math.round((analysis?.agreement01 ?? 0) * 100)}% · model spread {(analysis?.spreadMM ?? 0).toFixed(1)} mm
            {analysis?.quality?.suspect.length ? ` · suspect inputs excluded: ${analysis.quality.suspect.join(", ")}` : " · all inputs passed plausibility gates"}
          </dd>
        </div>
        <div><dt>Source</dt><dd>Open-Meteo observations + 4-model NWP consensus + in-repo AI fusion (transparent weights)</dd></div>
      </dl>
      <div className="metricLabel" style={{ marginTop: 14 }}>Suggested actions (standard advisory)</div>
      <ul className="actionList">
        {SAFETY.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="metricLabel" style={{ marginTop: 14 }}>Evidence — model drivers</div>
      <div className="chipRow">
        {risk.drivers.map((d) => (
          <span key={d} className="chip">{d}</span>
        ))}
      </div>
      <p className="prov">
        Dedupe key {w?.dedupeKey ?? "—"} — repeated identical alerts inside the validity window are collapsed. Inundation shown elsewhere is a model estimate, not observed flood extent.
      </p>
    </div>
  );
}
