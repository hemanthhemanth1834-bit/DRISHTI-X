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
    `Rain rate ${analysis.current?.precipitation ?? "—"} mm/h; 6h ${(analysis.accum?.h6 ?? 0).toFixed(1)} mm; 24h ${(analysis.accum?.h24 ?? 0).toFixed(1)} mm.`,
    `NWP: ${analysis.provenance?.modelsLive ?? 0}/4 live, agreement ${Math.round((analysis.agreement01 ?? 0) * 100)}%, spread ${(analysis.spreadMM ?? 0).toFixed(1)} mm.`,
    `AI-assisted risk ${r.score}/100 (${r.level}); inundation ${Math.round(r.inundation.prob01 * 100)}% ${r.inundation.class} — MODEL ESTIMATE, NOT OBSERVED FLOOD EXTENT.`,
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
