"use client";
import { AlertTriangle, CheckCircle2, Database, HeartPulse, RefreshCw, ShieldCheck } from "lucide-react";
import type { AnalysisPayload, RadarState, SatLayer } from "@/hooks/useDrishti";
import type { SourceStatus } from "@/lib/locations";
import { ageLabel, fmtIST } from "@/lib/format";
import { StatusBadge } from "./StatusBar";
import KpiRow, { type Kpi } from "./KpiRow";

interface HealthSrc {
  id: string;
  name: string;
  kind: string;
  status: SourceStatus;
}

const STATUS_ORDER: SourceStatus[] = ["LIVE", "RECENT", "READY", "DELAYED", "DEGRADED", "AUTH", "DEMO", "OFFLINE"];

export default function DataHealthView({
  analysis,
  radar,
  satLayers,
  health,
  live,
  onRefresh,
}: {
  analysis: AnalysisPayload | null;
  radar: RadarState;
  satLayers: SatLayer[];
  health: HealthSrc[];
  live: boolean;
  onRefresh: () => void;
}) {
  const satStatus: SourceStatus = satLayers.length === 0 ? "OFFLINE" : satLayers.some((l) => l.status === "LIVE" || l.status === "RECENT") ? "RECENT" : "OFFLINE";
  const mosdac = health.find((h) => h.id === "mosdac")?.status ?? "AUTH";
  const viirs = satLayers.find((l) => l.id === "viirs-truecolor");
  const aiStatus: SourceStatus = live && (analysis?.risk?.coverage01 ?? 0) > 0 ? "READY" : "OFFLINE";

  const rows: { name: string; kind: string; status: SourceStatus; last?: string; note: string }[] = [
    {
      name: "Open-Meteo", kind: "Weather + NWP", status: analysis?.status ?? "READY",
      last: analysis?.fetchedAt,
      note: `current + 48h hourly + ${analysis?.provenance?.modelsLive ?? 0}/4 NWP models · forecast API (free, no key)`,
    },
    {
      name: "RainViewer", kind: "Radar tiles", status: radar.status,
      last: radar.fetchedAt || undefined,
      note: `${radar.past.length} past frames · 10-min cadence · frame freshness up to 120 min · 512px tiles (z≤7 native)`,
    },
    {
      name: "NASA GIBS", kind: "Satellite imagery", status: satStatus,
      last: viirs?.date ? `${viirs.date} (product day)` : undefined,
      note: `${satLayers.length} products · VIIRS/MODIS true color + 7-2-1 false color · 250–500 m`,
    },
    {
      name: "AWS Terrarium DEM", kind: "Terrain sampling", status: (analysis?.terrain?.status as SourceStatus) ?? "READY",
      last: analysis?.fetchedAt,
      note: analysis?.terrain?.status === "READY"
        ? `point terrain: mean ${analysis.terrain.meanM} m · relief ${analysis.terrain.reliefM} m · lowland ${analysis.terrain.lowlandFrac == null ? "—" : `${Math.round(analysis.terrain.lowlandFrac * 100)}%`}`
        : (analysis?.terrain?.note ?? "terrain tiles not connected for this point"),
    },
    {
      name: "OSM Overpass", kind: "Rivers & drainage", status: (analysis?.rivers?.status as SourceStatus) ?? "OFFLINE",
      last: analysis?.fetchedAt,
      note: analysis?.rivers?.list?.length
        ? `${analysis.rivers.list.length} features within ~25 km · display context only (never scored)`
        : (analysis?.rivers?.note ?? "public Overpass instance degraded — river context unavailable"),
    },
    {
      name: "MOSDAC / ISRO", kind: "Indian satellite adapter", status: mosdac,
      note: mosdac === "AUTH" ? "credential-gated (MOSDAC_USERNAME unset) — adapter path documented, never faked" : "adapter configured",
    },
    {
      name: "AI Engine", kind: "Transparent fusion", status: aiStatus,
      last: analysis?.fetchedAt,
      note: aiStatus === "READY"
        ? "in-repo weighted fusion · explainability trace available per analysis"
        : "no scored analysis with input coverage yet",
    },
  ];

  const online = rows.filter((r) => r.status === "LIVE" || r.status === "RECENT").length;
  const checks = analysis?.quality?.checks ?? [];
  const okChecks = checks.filter((c) => c.ok).length;
  const qualityPct = checks.length ? Math.round((okChecks / checks.length) * 100) : null;

  const kpis: Kpi[] = [
    {
      icon: <ShieldCheck size={17} />, label: "Data quality",
      value: qualityPct == null ? "—" : `${qualityPct}%`,
      sub: checks.length ? `${okChecks}/${checks.length} plausibility gates pass` : "awaiting live inputs",
      tone: qualityPct == null ? "muted" : qualityPct === 100 ? "ok" : "watch",
      badge: qualityPct == null ? undefined : qualityPct === 100 ? "ALL GATES PASS" : "SUSPECT INPUTS EXCLUDED",
    },
    {
      icon: <HeartPulse size={17} />, label: "Sources online",
      value: `${online}/${rows.length}`,
      sub: "live or recent within freshness window",
      tone: online >= 4 ? "ok" : "watch",
    },
    {
      icon: <RefreshCw size={17} />, label: "Last analysis update",
      value: analysis?.fetchedAt ? fmtIST(analysis.fetchedAt) : "—",
      sub: analysis?.fetchedAt ? ageLabel(analysis.fetchedAt) : "no fetch yet",
      tone: "info",
    },
    {
      icon: <AlertTriangle size={17} />, label: "Suspect inputs",
      value: String(analysis?.quality?.suspect.length ?? 0),
      sub: analysis?.quality?.suspect.length ? `excluded & renormalized: ${analysis.quality.suspect.join(", ")}` : "none outside documented physical ranges",
      tone: (analysis?.quality?.suspect.length ?? 0) === 0 ? "ok" : "watch",
    },
  ];

  return (
    <div className="viewStack">
      <div className="panel">
        <div className="sectionHead">
          <div>
            <h2 style={{ fontSize: 20 }}>Data Quality & Source Health</h2>
            <p>Every value traces to a keyless public provider; gaps and failures are shown, never zero-filled. Plausibility gates run server-side on each analysis.</p>
          </div>
          <Database color="#4de3ff" />
        </div>
        <KpiRow items={kpis} />
        <table className="dataTable" style={{ marginTop: 14 }}>
          <thead>
            <tr><th>Source</th><th>Type</th><th>Status</th><th>Last update</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td><b>{r.name}</b></td>
                <td>{r.kind}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.last ? `${fmtIST(r.last)} · ${ageLabel(r.last)}` : "—"}</td>
                <td className="cellWide">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="prov">
          Freshness windows: analysis 10 min · radar frame freshness 120 min · satellite 60 min. Statuses reflect the latest client fetch; provider publication latency is not exposed by the upstream APIs and is therefore not claimed.
        </p>
      </div>

      <div className="miGrid">
        <div className="panel miCol">
          <div className="metricLabel">Plausibility gates — current analysis{analysis?.fetchedAt ? ` (${fmtIST(analysis.fetchedAt)})` : ""}</div>
          {checks.length === 0 ? (
            <p className="unavail">GATE RESULTS APPEAR WITH THE NEXT LIVE ANALYSIS — each numeric input is checked against a documented physical range; out-of-range values become missing and the engine renormalizes weights.</p>
          ) : (
            <ul className="checkList">
              {checks.map((c) => (
                <li key={c.field} className={c.ok ? "ok" : "bad"}>
                  {c.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <b>{c.field}</b>
                  <span>{c.note}</span>
                </li>
              ))}
            </ul>
          )}
          {analysis?.quality?.note && <p className="prov">{analysis.quality.note}</p>}
        </div>
        <div className="panel miCol">
          <div className="metricLabel">Provider map — keyless only</div>
          <ul className="docList">
            <li><b>Open-Meteo</b> — weather, 4 NWP models (ECMWF IFS, GFS, ICON, GEM), elevation, ERA5 archive. Free, no key.</li>
            <li><b>RainViewer</b> — radar past frames + nowcast metadata. Free, no key. Native zoom ceiling enforced (z≤7).</li>
            <li><b>NASA GIBS</b> — WMTS satellite imagery. Free, no key. Default product VIIRS (gap-free; Terra/Aqua carry ~9% swath no-data).</li>
            <li><b>AWS Terrarium</b> — TerrainRGB DEM tiles for point terrain stats. Free, no key.</li>
            <li><b>OSM Overpass</b> — river geometry context. Free, no key; public instance degraded at times.</li>
            <li><b>MOSDAC</b> — credential-gated; adapter present, never simulated.</li>
          </ul>
          <div className="miStatus">
            <button className="tab" onClick={onRefresh} disabled={!live && analysis == null}>↻ RE-PROBE SOURCES</button>
            <span className="prov" style={{ margin: 0 }}>Probes hit the same endpoints the app uses.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
