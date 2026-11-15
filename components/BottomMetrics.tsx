"use client";
import { DEMO_LOCATIONS } from "@/lib/locations";
import type { AnalysisPayload } from "@/hooks/useDrishti";

export default function BottomMetrics({
  analysis,
  live,
  healthLive,
  healthTotal,
  onPick,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  healthLive: number;
  healthTotal: number;
  onPick: (lat: number, lon: number, name: string) => void;
}) {
  return (
    <footer className="shBottom" aria-label="System metrics">
      <div className="bCol">
        <span className="metricLabel">India — geographic reference</span>
        <b>3.29M km² · ~1.43B people</b>
        <span className="prov">Standard geographic reference, not live data.</span>
      </div>
      <div className="bCol">
        <span className="metricLabel">Monitored locations ({DEMO_LOCATIONS.length})</span>
        <div className="chipRow">
          {DEMO_LOCATIONS.map((d) => (
            <button key={d.name} className="chip" onClick={() => onPick(d.lat, d.lon, d.name)}>
              {d.name}
            </button>
          ))}
        </div>
      </div>
      <div className="bCol">
        <span className="metricLabel">Active data sources</span>
        <b>{healthLive}/{healthTotal} live or recent</b>
        <span className="prov">NWP {analysis?.provenance?.modelsLive ?? 0}/4 · agreement {Math.round((analysis?.agreement01 ?? 0) * 100)}%</span>
      </div>
      <div className="bCol">
        <span className="metricLabel">Active weather systems</span>
        <b>{live && analysis?.risk ? `${analysis.risk.level} — ${analysis.label}` : "No live assessment"}</b>
        <span className="prov">{live && analysis?.risk ? `Drivers: ${analysis.risk.drivers.slice(0, 2).join(" · ")}` : "Awaiting provider data."}</span>
      </div>
    </footer>
  );
}
