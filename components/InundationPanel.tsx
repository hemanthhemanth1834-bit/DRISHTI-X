"use client";
import { CheckCircle2, CircleSlash2, Waves } from "lucide-react";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import { LEVEL_COLOR } from "@/lib/engine";

export default function InundationPanel({
  analysis,
  live,
  label,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
}) {
  const risk = live ? analysis?.risk : undefined;
  const terrain = analysis?.terrain;
  const rivers = analysis?.rivers;
  const color = risk ? LEVEL_COLOR[risk.level] : "#8190a8";

  const layers: { name: string; on: boolean; why: string }[] = [
    { name: "Predicted extent (model)", on: true, why: "Fusion-estimate zone drawn around the analysis point — schematic, not observed water." },
    { name: "Water depth (m)", on: false, why: "Not connected — requires raster DEM + drainage model; no honest depth number exists." },
    { name: "Low-lying areas", on: terrain?.status === "READY" && terrain.lowlandFrac != null, why: terrain?.status === "READY" ? `Terrarium DEM lowland fraction (<25 m): ${terrain.lowlandFrac == null ? "—" : `${Math.round(terrain.lowlandFrac * 100)}%`}` : "DEM tiles unavailable for this point." },
    { name: "River / drainage context", on: (rivers?.list?.length ?? 0) > 0, why: (rivers?.list?.length ?? 0) > 0 ? `${rivers?.list.slice(0, 3).map((r) => r.name).join(", ")}` : (rivers?.note ?? "Overpass river lookup offline.") },
    { name: "Inundation grid (raster)", on: false, why: "Not connected — no gridded inundation dataset; the app never renders an invented raster." },
  ];

  return (
    <div className="panel inundPanel">
      <div className="sectionHead" style={{ marginBottom: 8 }}>
        <div>
          <h2 style={{ fontSize: 19 }}>Inundation analysis</h2>
          <p>Model estimate — never observed flood extent</p>
        </div>
        <Waves color="#4de3ff" />
      </div>

      {!risk ? (
        <p className="unavail">SOURCE UNAVAILABLE — inundation cannot be estimated without live inputs; no cached or simulated zones are shown.</p>
      ) : (
        <>
          <div className="inundScore" style={{ borderColor: `${color}55` }}>
            <div>
              <span className="metricLabel">Probability · class</span>
              <b className="rBig" style={{ fontSize: 26 }}>{Math.round(risk.inundation.prob01 * 100)}% <span style={{ color }}>{risk.inundation.class}</span></b>
            </div>
            <span className="prov" style={{ margin: 0 }}>{label}</span>
          </div>

          <div className="metricLabel" style={{ marginTop: 12 }}>Inundation layers</div>
          <ul className="layerList">
            {layers.map((l) => (
              <li key={l.name} className={l.on ? "on" : "off"} title={l.why}>
                {l.on ? <CheckCircle2 size={14} /> : <CircleSlash2 size={14} />}
                <b>{l.name}</b>
                <span>{l.why}</span>
              </li>
            ))}
          </ul>

          <div className="metricLabel" style={{ marginTop: 12 }}>Risk summary</div>
          <dl className="factGrid">
            <div><dt>Affected area</dt><dd>Not computed — needs a DEM-based extent model (not connected)</dd></div>
            <div><dt>Est. max depth</dt><dd>Not computed — no depth model or observations available</dd></div>
            <div><dt>Terrain mean elevation</dt><dd>{terrain?.status === "READY" ? `${terrain.meanM} m (DEM sample)` : "—"}</dd></div>
            <div><dt>Relief / lowland</dt><dd>{terrain?.status === "READY" ? `std ${terrain.reliefM} m · <25m ${terrain.lowlandFrac == null ? "—" : `${Math.round(terrain.lowlandFrac * 100)}%`}` : "—"}</dd></div>
          </dl>

          <div className="metricLabel" style={{ marginTop: 12 }}>Factors considered (display context — score unchanged by these)</div>
          <div className="chipRow">
            {risk.inundation.factors.map((f) => (
              <span key={f.name} className="chip" title={f.value}>{f.name}</span>
            ))}
          </div>
          <p className="prov">{risk.inundation.terrainNote}</p>
        </>
      )}
      <p className="prov">
        Depth and area claims require a connected DEM/depth model; until then this panel deliberately shows &quot;not computed&quot; instead of estimates that could be mistaken for observations.
      </p>
    </div>
  );
}
