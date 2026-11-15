"use client";
import { useState } from "react";
import { FEATURE_DOCS, RISK_FORMULA, WARNING_SYSTEM, WARNING_THRESHOLDS } from "@/lib/engine";
import { TERRAIN_STATUS } from "@/lib/terrain";

export default function Methodology() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Data Sources & Methodology
      </button>
      {open && (
        <div className="drawerWrap" role="dialog" aria-modal="true" aria-label="Data sources and methodology">
          <div className="drawer">
            <div className="sectionHead">
              <div>
                <h2 style={{ fontSize: 20 }}>Data Sources & Methodology</h2>
                <p>Attribution · units · formula · limitations</p>
              </div>
              <button className="tab" onClick={() => setOpen(false)} aria-label="Close methodology">
                CLOSE ✕
              </button>
            </div>
            <h3 className="methH">Risk formula (rule/weighted fusion — not a trained ML model)</h3>
            <p className="prov">{RISK_FORMULA}</p>
            <table className="methTable">
              <thead><tr><th>Feature</th><th>Wt</th><th>Source</th><th>Unit</th><th>Normalization</th><th>Why</th></tr></thead>
              <tbody>
                {FEATURE_DOCS.map((f) => (
                  <tr key={f.feature}><td>{f.feature}</td><td>{f.weight}</td><td>{f.source}</td><td>{f.unit}</td><td>{f.normalization}</td><td>{f.reason}</td></tr>
                ))}
              </tbody>
            </table>
            <h3 className="methH">Warning bands — {WARNING_SYSTEM}</h3>
            <p className="prov">
              NORMAL ≥{WARNING_THRESHOLDS.NORMAL} · WATCH ≥{WARNING_THRESHOLDS.WATCH} · ALERT ≥{WARNING_THRESHOLDS.ALERT} · SEVERE ≥
              {WARNING_THRESHOLDS.SEVERE} · EXTREME ≥{WARNING_THRESHOLDS.EXTREME} (score 0–100). Research thresholds, not IMD official thresholds.
            </p>
            <h3 className="methH">Attribution</h3>
            <ul className="methList">
              <li><b>Open-Meteo</b> — current + hourly weather, soil moisture (m³/m³), elevation; 4 NWP models (ECMWF IFS open 0.4°, GFS, ICON, GEM). Free, no key. © Open-Meteo.com. Units: mm, mm/h, °C, hPa, km/h.</li>
              <li><b>RainViewer</b> — public radar tiles (512px, ~10-min past frames). Animated where frames exist, else RADAR DATA UNAVAILABLE. Satellite-IR is not offered: the provider discontinued that service in 2026. © RainViewer.</li>
              <li><b>NASA GIBS</b> — MODIS/VIIRS true-color plus 7-2-1 false color for flood/vegetation contrast, via public WMTS (daily, date shown per layer, RECENT). 3D globe surface: NASA Blue Marble texture bundled locally (three.js repo, MIT) for a seamless sphere; live GIBS stays in the satellite viewer and map overlays. Credit: NASA EOSDIS.</li>
              <li><b>IMD (reference only)</b> — official warnings at mausam.imd.gov.in. IMD publishes no free machine-readable warning API, so DRISHTI-X warnings are computed locally and never presented as IMD warnings.</li>
              <li><b>MOSDAC / ISRO</b> — optional adapter path; AUTH without credentials, never faked.</li>
              <li><b>OpenStreetMap</b> — basemap (verified keyless). © OpenStreetMap contributors. CARTO layers were removed after live verification showed placeholder tiles.</li>
            </ul>
            <h3 className="methH">Inundation & terrain</h3>
            <p className="prov">
              The inundation risk index is an uncalibrated heuristic (0–100), not a probability, and is NOT OBSERVED FLOOD
              EXTENT. It combines forecast/antecedent rain, soil moisture and point elevation while disclosing factor
              coverage. {TERRAIN_STATUS}.
            </p>
            <h3 className="methH">Scientific limitations</h3>
            <ul className="methList">
              <li>Live warnings come from the documented weighted fusion above. A separately validated experimental rainfall classifier ships for research comparison but is excluded from warning scores.</li>
              <li>No DEM/slope/drainage inputs; inundation rings are schematic, not surveyed flood boundaries.</li>
              <li>NWP run/init times are not published by the provider; consensus uses aligned forecast windows instead. Model identity follows the provider&apos;s documented `models` request contract (responses carry no model echo).</li>
              <li>NWP agreement = max(0, 1 − spread / max(mean, 2 mm)) over identical-window live totals; missing models are excluded, never zero-filled. Bars scale to the largest live total.</li>
              <li>Hourly provider gaps are preserved as chart breaks and counted per window; an accumulation window is withheld (null) when any expected hour is missing. Null inputs always render as unavailable, never as zero.</li>
              <li>Each card derives from its own response section and fetch (analysis / radar / satellite / health); a failed provider marks only its own card OFFLINE, and cards refresh independently.</li>
              <li>Computation uses UTC Unix seconds; all displayed times are rendered explicitly in IST. Calendar dates are provider-local (India scope).</li>
              <li>Data availability and latency depend on upstream providers; statuses reflect actual fetch outcomes.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
