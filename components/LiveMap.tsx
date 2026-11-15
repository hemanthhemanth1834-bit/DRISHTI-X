"use client";
import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { DEMO_LOCATIONS, INDIA_CENTER, type SourceStatus } from "@/lib/locations";
import { RADAR_MAX_NATIVE_ZOOM } from "@/lib/radar";
import { LEVEL_COLOR, type WarningLevel } from "@/lib/engine";
import type { SatLayer } from "@/hooks/useDrishti";

function FlyTo({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lon], Math.max(map.getZoom(), 7), { duration: 1.2 });
  }, [lat, lon, map]);
  return null;
}

const INUND_CLASSES = [
  { n: "LOW", c: "#3cff9a" },
  { n: "MODERATE", c: "#ffd166" },
  { n: "HIGH", c: "#ffb454" },
  { n: "SEVERE", c: "#ff6b86" },
];

export default function LiveMap({
  lat,
  lon,
  label,
  radar,
  satLayers,
  level,
  inundRisk,
  onCity,
}: {
  lat: number;
  lon: number;
  label: string;
  radar: { status: SourceStatus; host: string; past: { time: number; path: string }[]; generated: number };
  satLayers: SatLayer[];
  level: WarningLevel;
  inundRisk: number;
  onCity: (lat: number, lon: number, name: string) => void;
}) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [radarOp, setRadarOp] = useState(0.65);
  const [satOp, setSatOp] = useState(0.55);
  const [satId, setSatId] = useState("viirs-truecolor");
  const [full, setFull] = useState(false);
  // Layer state — chips and the Layers panel drive the same toggles.
  const [layers, setLayers] = useState({ radar: true, satellite: false, terrain: false, risk: true });
  const [panelOpen, setPanelOpen] = useState(true);

  const frames = useMemo(() => radar.past.slice(-8), [radar]);
  useEffect(() => setFrame(0), [radar.host, radar.past.length]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % frames.length), 1500);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  const gibsOptions = useMemo(
    () => satLayers.filter((l) => l.template && (l.status === "RECENT" || l.status === "LIVE")),
    [satLayers]
  );
  const activeSat = gibsOptions.find((l) => l.id === satId) ?? gibsOptions[0];
  const radarLive = radar.status === "LIVE" && frames.length > 0;
  const frameTime = frames[frame]
    ? `${new Date(frames[frame].time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} IST`
    : "—";
  const toggle = (k: keyof typeof layers) => setLayers((s) => ({ ...s, [k]: !s[k] }));

  const chip = (k: "radar" | "satellite" | "terrain" | "risk", name: string, disabled = false, note?: string) => (
    <button
      type="button"
      className={`mChip${layers[k] && !disabled ? " on" : ""}${disabled ? " off" : ""}`}
      aria-pressed={disabled ? undefined : layers[k]}
      disabled={disabled}
      title={note}
      onClick={() => !disabled && toggle(k)}
    >
      {name}
    </button>
  );

  return (
    <div className={full ? "mapWrap mapFull" : "mapWrap"}>
      <MapContainer center={INDIA_CENTER} zoom={5} scrollWheelZoom style={{ height: "100%", width: "100%" }} aria-label={`Rainfall command map centered on ${label}, India`}>
        <FlyTo lat={lat} lon={lon} />
        {layers.terrain ? (
          <TileLayer
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            maxNativeZoom={17}
            attribution="&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)"
          />
        ) : (
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}
        {layers.radar && radarLive && (
          <TileLayer
            url={`${radar.host}${frames[frame]?.path ?? ""}/512/{z}/{x}/{y}/2/1_1.png`}
            tileSize={512}
            zoomOffset={-1}
            maxNativeZoom={RADAR_MAX_NATIVE_ZOOM}
            opacity={radarOp}
            zIndex={10}
            attribution="Weather data by RainViewer"
          />
        )}
        {layers.satellite && activeSat?.template && (
          <TileLayer url={activeSat.template} opacity={satOp} zIndex={5} maxZoom={9} attribution="NASA EOSDIS GIBS" />
        )}
        {layers.risk && (
          <Circle
            center={[lat, lon]}
            radius={65000}
            pathOptions={{ color: LEVEL_COLOR[level], fillColor: LEVEL_COLOR[level], fillOpacity: 0.1 + (inundRisk / 100) * 0.15 }}
          >
            <Popup>
              <b>{label}</b>
              <br />
              Inundation risk index (UNCALIBRATED MODEL ESTIMATE — NOT OBSERVED FLOOD EXTENT): {inundRisk}/100
            </Popup>
          </Circle>
        )}
        <CircleMarker center={[lat, lon]} radius={9} pathOptions={{ color: LEVEL_COLOR[level], fillColor: LEVEL_COLOR[level], fillOpacity: 0.9 }}>
          <Popup>
            <b>{label}</b>
            <br />
            {lat.toFixed(2)}, {lon.toFixed(2)} — live analysis point
          </Popup>
        </CircleMarker>
        {DEMO_LOCATIONS.filter((d) => d.name !== label).map((d) => (
          <CircleMarker
            key={d.name}
            center={[d.lat, d.lon]}
            radius={5}
            pathOptions={{ color: "#4de3ff", fillColor: "#4de3ff", fillOpacity: 0.6 }}
            eventHandlers={{ click: () => onCity(d.lat, d.lon, d.name) }}
          >
            <Popup>
              <b>{d.name}</b>, {d.state}
              <br />
              Click to analyze live data.
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="mChips" role="group" aria-label="Map layers">
        {chip("radar", radarLive ? "RADAR" : `RADAR ${radar.status}`, false, "RainViewer rainfall nowcast (observed reflectivity), z≤7 native")}
        {chip("satellite", "SATELLITE", gibsOptions.length === 0, "NASA GIBS true-color imagery over the last product days")}
        {chip("terrain", "TERRAIN", false, "OpenTopoMap terrain base (OSM + SRTM contours)")}
        {chip("risk", "RAINFALL + INUNDATION (MODEL)", false, "Model-estimate circles — not observed flood extent")}
        <button type="button" className="mChip off" disabled title="River geometry adapter: OSM Overpass public instance degraded — only river names within ~25 km are shown in Inundation Analysis">RIVERS</button>
        <button type="button" className="mChip off" disabled title="Administrative boundary dataset not connected — no boundary layer available">BOUNDARIES</button>
      </div>

      <div className={`layerPanel${panelOpen ? "" : " closed"}`} aria-label="Map layers panel">
        <button type="button" className="lpHead" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
          LAYERS <span aria-hidden>{panelOpen ? "▾" : "▸"}</span>
        </button>
        {panelOpen && (
          <div className="lpBody">
            <label className="lpRow" title="RainViewer rainfall/reflectivity nowcast">
              <input type="checkbox" checked={layers.radar} onChange={() => toggle("radar")} /> Radar (RainViewer)
              <i className={`lpDot s-${radar.status}`} />
            </label>
            <label className="lpRow" title="NASA GIBS imagery (VIIRS/MODIS true color)">
              <input type="checkbox" checked={layers.satellite} onChange={() => toggle("satellite")} disabled={gibsOptions.length === 0} /> Satellite (NASA GIBS)
              <i className={`lpDot s-${gibsOptions.length ? "RECENT" : "OFFLINE"}`} />
            </label>
            <label className="lpRow" title="OpenTopoMap terrain base — OSM + SRTM hillshade/contours">
              <input type="checkbox" checked={layers.terrain} onChange={() => toggle("terrain")} /> Terrain base (OpenTopoMap)
            </label>
            <label className="lpRow" title="Predicted rainfall + inundation model estimate — not observed">
              <input type="checkbox" checked={layers.risk} onChange={() => toggle("risk")} /> Inundation (model estimate)
            </label>
            <label className="lpRow lpDim" title="Not connected: Overpass geometry unavailable">Rivers & drainage<input type="checkbox" disabled /></label>
            <label className="lpRow lpDim" title="Not connected: no boundary dataset">District boundaries<input type="checkbox" disabled /></label>
            {layers.radar && radarLive && (
              <label className="lpRange">Radar opacity
                <input type="range" min={10} max={100} value={Math.round(radarOp * 100)} onChange={(e) => setRadarOp(Number(e.target.value) / 100)} />
              </label>
            )}
            {layers.satellite && (
              <label className="lpRange">Satellite opacity
                <input type="range" min={10} max={100} value={Math.round(satOp * 100)} onChange={(e) => setSatOp(Number(e.target.value) / 100)} />
              </label>
            )}
          </div>
        )}
      </div>

      <div className="mapOverlay" aria-label="Map legend">
        LAYER LEGEND
        <div className="legendBar"><span className="legendGrad" /><span>Light → Extreme (RainViewer provider color scale)</span></div>
        <div className="legend">
          {INUND_CLASSES.map((c) => (
            <b key={c.n}><i style={{ background: c.c }} /> {c.n}</b>
          ))}
        </div>
        <span className="prov">Inundation zones: translucent model estimate, not observed water.</span>
      </div>

      <div className="mapCtl" role="group" aria-label="Radar timeline">
        <span className="live" style={{ color: radarLive ? "#68ffc0" : "#ff8aa0" }}>
          ● RADAR {radar.status}
        </span>
        {radarLive ? (
          <>
            <button className="tab" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause radar" : "Play radar"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={frame}
              onChange={(e) => setFrame(Number(e.target.value))}
              aria-label="Radar frame (10-minute interval past frames)"
              className="scrub"
            />
            <span className="sbMeta">{frameTime}</span>
          </>
        ) : (
          <span className="sbMeta">RADAR DATA UNAVAILABLE</span>
        )}
        <label className="sbMeta">
          SAT{" "}
          <select value={activeSat?.id ?? ""} onChange={(e) => setSatId(e.target.value)} aria-label="NASA GIBS satellite layer" className="satSel">
            {gibsOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.product}</option>
            ))}
          </select>
        </label>
        <button className="tab" onClick={() => setFull((f) => !f)} aria-label="Toggle fullscreen map">
          {full ? "EXIT ⤢" : "FULL ⤢"}
        </button>
      </div>
    </div>
  );
}
