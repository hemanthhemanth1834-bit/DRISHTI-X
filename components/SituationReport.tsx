"use client";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import { fmtIST } from "@/lib/format";
import DataFabric, { type FabricSource } from "./DataFabric";
import Methodology from "./Methodology";

/** Situation report generated strictly from live payload values. */
export default function SituationReport({
  analysis,
  live,
  label,
  lat,
  lon,
  fabric,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
  lat: number;
  lon: number;
  fabric: FabricSource[];
}) {
  if (!live || !analysis?.risk) {
    return (
      <div className="panel explain">
        <div className="metricLabel">Situation report</div>
        <p className="unavail">SOURCE UNAVAILABLE — no live inputs to report on.</p>
        <div style={{ marginTop: 12 }}><Methodology /></div>
      </div>
    );
  }
  const r = analysis.risk;
  const lines = [
    `Focus: ${label} (${lat.toFixed(2)}, ${lon.toFixed(2)}) at ${fmtIST(analysis.fetchedAt)}.`,
    `Rain rate ${analysis.current?.precipitationRateMMH ?? "—"} mm/h (model-derived); 6h ${analysis.accum?.h6 == null ? "— (incomplete)" : `${analysis.accum.h6.toFixed(1)} mm`}; 24h ${analysis.accum?.h24 == null ? "— (incomplete)" : `${analysis.accum.h24.toFixed(1)} mm`}.`,
    `NWP: ${analysis.provenance?.modelsLive ?? 0}/4 live, agreement ${analysis.agreement01 == null ? "—" : `${Math.round(analysis.agreement01 * 100)}%`}, spread ${analysis.spreadMM == null ? "—" : `${analysis.spreadMM.toFixed(1)} mm`}.`,
    `AI-assisted risk ${r.score}/100 (${r.level}), input coverage ${Math.round(r.coverage01 * 100)}%; inundation risk index ${r.inundation.riskIndex}/100 ${r.inundation.class} (factor coverage ${Math.round(r.inundation.coverage01 * 100)}%) — UNCALIBRATED MODEL ESTIMATE, NOT OBSERVED FLOOD EXTENT.`,
    `Drivers: ${r.drivers.join("; ")}.`,
  ];
  return (
    <div className="repGrid">
      <div className="panel explain">
        <div className="metricLabel">Situation report — generated from live values {fmtIST(analysis.fetchedAt)}</div>
        <ul className="methList">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div style={{ marginTop: 12 }}><Methodology /></div>
      </div>
      <DataFabric sources={fabric} />
    </div>
  );
}
