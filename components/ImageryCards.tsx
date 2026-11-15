"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { radarDisplayStatus, radarFrameAgeMin, radarAgeLabel } from "@/lib/radar";
import type { SatLayer } from "@/hooks/useDrishti";
import type { SourceStatus } from "@/lib/locations";
import { StatusBadge } from "./StatusBar";

const RadarMiniMap = dynamic(() => import("./RadarMiniMap"), {
  ssr: false,
  loading: () => <div className="imgShimmer" aria-label="Loading radar map" />,
});
const SatMiniMap = dynamic(() => import("./SatMiniMap"), {
  ssr: false,
  loading: () => <div className="imgShimmer" aria-label="Loading satellite imagery" />,
});

export interface RadarInfo {
  status: SourceStatus;
  host: string;
  past: { time: number; path: string }[];
  nowcast: { time: number; path: string }[];
}

export interface ModelCtx {
  h24: number | null;
  level: string;
}

function frameIST(t: number): string {
  return (
    new Date(t * 1000).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " IST"
  );
}

function FailedBox({ source, onRetry, extra }: { source: string; onRetry: () => void; extra?: string }) {
  return (
    <div className="imgFallback" role="alert">
      <b>{source === "RainViewer" ? "RADAR DATA UNAVAILABLE" : "DATA UNAVAILABLE"}</b>
      <span>{source} could not be reached at this time.</span>
      <span className="prov">SOURCE: {source} · STATUS: UNAVAILABLE</span>
      {extra && <span className="prov">{extra}</span>}
      <button className="tab" onClick={onRetry}>RETRY</button>
    </div>
  );
}

const GIBS_BTNS = [
  { id: "terra-truecolor", short: "TRUE COLOR" },
  { id: "viirs-truecolor", short: "VIIRS" },
  { id: "modis-721", short: "MODIS" },
];

export default function ImageryCards({
  layers,
  lat,
  lon,
  label,
  radar,
  modelCtx,
  onRetry,
  onRefreshRadar,
  onRefreshSat,
}: {
  layers: SatLayer[];
  lat: number;
  lon: number;
  label: string;
  radar: RadarInfo;
  modelCtx?: ModelCtx | null;
  onRetry?: () => void;
  onRefreshRadar?: () => void;
  onRefreshSat?: () => void;
}) {
  const gibs = useMemo(() => layers.filter((l) => l.template), [layers]);
  // Default = VIIRS: measured 0.00% no-data over the India viewport, while
  // Terra/Aqua daily composites carry ~9% orbital acquisition gaps (black
  // wedges = genuine no-data, never fabricated or painted over).
  const [gibsId, setGibsId] = useState("viirs-truecolor");
  const [frameIdx, setFrameIdx] = useState<number | null>(null);
  const [radOp, setRadOp] = useState(0.85);
  const [satRetry, setSatRetry] = useState(0);
  const [, setRadRetry] = useState(0);
  const [satMapFailed, setSatMapFailed] = useState(false);
  const [satLoading, setSatLoading] = useState(true);
  const [freshLabel, setFreshLabel] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<null | { kind: "sat" | "radar"; src: string; title: string }>(null);
  const [lbOp, setLbOp] = useState(1);
  const active = gibs.find((l) => l.id === gibsId) ?? gibs[0];
  // Honest freshness from the real product date (client-only effect; SSR shows nothing).
  useEffect(() => {
    setSatLoading(true);
    setSatMapFailed(false);
    if (!active?.date) {
      setFreshLabel(null);
      return;
    }
    const yd = new Date(Date.now() - 864e5);
    const yest = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;
    setFreshLabel(active.date >= yest ? "LATEST AVAILABLE" : "HISTORICAL OBSERVATION");
  }, [active?.date, gibsId]);

  const frames = useMemo(() => radar.past.slice(-8), [radar]);
  const fi = frameIdx ?? (frames.length - 1);
  const frame = frames.length ? frames[Math.max(0, Math.min(fi, frames.length - 1))] : null;
  // Display status from actual frame timestamps (never trust a stale LIVE).
  const latestAge = frame ? radarFrameAgeMin(frame.time) : null;
  const dispStatus = radarDisplayStatus(frames.length > 0, latestAge);
  const radarLive = dispStatus === "LIVE" && !!frame;
  const hasNowcast = radar.nowcast.length > 0;

  // Real radar playback: chronological loop over provider frames only.
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = setInterval(() => {
      setFrameIdx((i) => {
        const cur = i ?? frames.length - 1;
        return (cur + 1) % frames.length;
      });
    }, 1400);
    return () => clearInterval(id);
  }, [playing, frames.length]);
  // Autoplay unless the user prefers reduced motion (client-only effect).
  useEffect(() => {
    if (frames.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames.length > 1]);

  // Last successful observation (shown on failure instead of fake data).
  const [lastGood, setLastGood] = useState<{ time: number; host: string; path: string } | null>(null);
  // Measured echo presence in the center tile (0–1 fraction, null = unverified).
  const [echoPct, setEchoPct] = useState<number | null>(null);
  useEffect(() => {
    if (radarLive && frame) setLastGood({ time: frame.time, host: radar.host, path: frame.path });
  }, [radarLive, frame, radar.host]);

  const lbMeta =
    lightbox?.kind === "sat" && active
      ? [
          ["Source", "NASA GIBS"],
          ["Product", active.product],
          ["Date", active.date],
          ["Resolution", active.resolution],
          ["Location", `${label} · ${lat.toFixed(2)}, ${lon.toFixed(2)}`],
          ["Status", active.status],
        ]
      : [
          ["Source", "RainViewer"],
          ["Product", "Precipitation radar (provider color scale, not calibrated dBZ)"],
          ["Frame", frame ? `${frameIST(frame.time)} (${radarAgeLabel(latestAge)})` : "—"],
          ["Location", `${label} · ${lat.toFixed(2)}, ${lon.toFixed(2)}`],
          ["Status", dispStatus],
        ];

  return (
    <div className="imgGrid imgGridV2">
      {/* ============ SATELLITE CLOUD FIELD (real GIBS tiled viewport) ============ */}
      <figure className="imgCard satCard">
        <div className="vpBanner">
          <div>
            <span className="vpKicker">NASA EARTH OBSERVATION</span>
            <b>SATELLITE CLOUD FIELD</b>
          </div>
          {active && <StatusBadge status={active.status} />}
        </div>
        {active?.template && !satMapFailed ? (
          <>
            <div className="vpStage" key={`satmap-${active.id}-${satRetry}`}>
              <SatMiniMap
                template={active.template}
                product={active.product}
                date={active.date}
                lat={lat}
                lon={lon}
                label={label}
                opacity={0.9}
                tall
                showControls
                onLoad={() => setSatLoading(false)}
                onTileError={() => setSatMapFailed(true)}
              />
              {satLoading && <div className="imgShimmer" aria-label="Loading satellite imagery" />}
              <div className="vpTopTag">● {freshLabel ?? "LOADING SATELLITE IMAGERY"} · NASA GIBS · INDIA / {label.toUpperCase()}</div>
              <div className="vpBotBar">
                <span>{active.product.toUpperCase()}</span>
                <span>OBSERVED {active.date}</span>
                <span>{active.resolution.toUpperCase()}</span>
              </div>
            </div>
            <div className="vpCtl" role="group" aria-label="Satellite viewport controls">
              <span className="segRow" role="group" aria-label="Satellite product (changes real imagery)">
                {GIBS_BTNS.map((b) => (
                  <button key={b.id} className={`tab${gibsId === b.id ? " active" : ""}`} onClick={() => setGibsId(b.id)} aria-pressed={gibsId === b.id}>
                    {b.short}
                  </button>
                ))}
              </span>
              <span className="segRow">
                <button className="tab tabPrimary" onClick={() => setLightbox({ kind: "sat", src: "", title: "Satellite Cloud Field" })}>FULLSCREEN ⤢</button>
              </span>
            </div>
            <div className="provBar">SOURCE: NASA GIBS · PRODUCT: {active.id.toUpperCase()} · OBSERVATION: {active.date} · STATUS: {freshLabel ?? "LOADING"}</div>
            {gibsId !== "viirs-truecolor" && (
              <span className="prov">This {gibsId === "modis-721" ? "MODIS" : "Terra"} daily composite can contain orbital acquisition gaps — black wedges are genuine no-data, not a rendering fault. VIIRS is gap-free for this region.</span>
            )}
            <span className="prov">Dark ocean is genuine daytime true-color imagery, not missing data. Zoom is capped at the product&apos;s maximum tile level so tiles never break.</span>
          </>
        ) : (
          <FailedBox
            source="NASA GIBS"
            extra={active ? `Last requested product ${active.product} · ${active.date}.` : undefined}
            onRetry={() => { if (onRefreshSat) onRefreshSat(); else if (onRetry) onRetry(); else { setSatMapFailed(false); setSatLoading(true); setSatRetry((r) => r + 1); } }}
          />
        )}
        <div className="modelCtx">
          <span className="metricLabel">MODEL CONTEXT — NOT SATELLITE OBSERVATION</span>
          <div className="modelCtxRow">
            <div><dt>24H PRECIPITATION</dt><dd>{modelCtx?.h24 == null ? "—" : `${modelCtx.h24.toFixed(1)} mm`}</dd></div>
            <div><dt>RISK</dt><dd>{modelCtx?.level ?? "—"}</dd></div>
            <div><dt>SOURCE</dt><dd>AI/ML MODEL ESTIMATE</dd></div>
          </div>
          <span className="prov">24H precipitation = Open-Meteo hourly forecast sum · Risk = DRISHTI-X rule/weighted-fusion engine over live inputs. Values update with the analysis; “—” means that input is currently unavailable.</span>
        </div>
      </figure>

      {/* ============ PRECIPITATION RADAR OBSERVATION ============ */}
      <figure className="imgCard radCard">
        <div className="vpBanner">
          <div>
            <span className="vpKicker">LIVE PRECIPITATION WATCH</span>
            <b>PRECIPITATION RADAR OBSERVATION</b>
          </div>
          <StatusBadge status={dispStatus} />
        </div>
        {radarLive && frame ? (
          <>
            {/* Stable map instance: frame changes flow through the radar
                TileLayer URL (Leaflet setUrl) — no remount, no tile churn. */}
            <div className="vpStage">
              <RadarMiniMap host={radar.host} path={frame.path} timeLabel={frameIST(frame.time)} lat={lat} lon={lon} label={label} opacity={radOp} zoom={5} tall onCoverage={setEchoPct} />
              <span className="radarSweep" aria-hidden />
              <div className="vpTopTag">RAINVIEWER · {frameIST(frame.time)} · {radarAgeLabel(latestAge).toUpperCase()} · {label.toUpperCase()}</div>
              <div className="vpBotBar">
                <span>FRAME {fi + 1}/{frames.length} · 10-MIN INTERVAL{playing ? " · PLAYING" : ""}</span>
                <span>{hasNowcast ? `${radar.nowcast.length} NOWCAST` : "NOWCAST UNAVAILABLE"}</span>
              </div>
            </div>
            <div className="radarTimeline" role="group" aria-label="Radar frame timeline">
              <span className="sbMeta">PAST</span>
              <div className="tlTrack">
                {frames.map((f, i) => (
                  <button
                    key={f.time}
                    className={`tlDot${i === Math.max(0, Math.min(fi, frames.length - 1)) ? " active" : ""}`}
                    onClick={() => setFrameIdx(i)}
                    aria-label={`Radar frame ${frameIST(f.time)}`}
                    title={frameIST(f.time)}
                  />
                ))}
                <span className="tlNow">NOW</span>
              </div>
              <input
                type="range" min={0} max={frames.length - 1} value={Math.max(0, Math.min(fi, frames.length - 1))}
                onChange={(e) => setFrameIdx(Number(e.target.value))}
                aria-label="Scrub radar frames (actual provider timestamps)" className="scrub"
              />
              <b className="frameTime">{frame ? frameIST(frame.time) : "—"}</b>
            </div>
            <div className="vpCtl" role="group" aria-label="Radar map controls">
              <button className="tab" onClick={() => setPlaying((pl) => !pl)} aria-label={playing ? "Pause radar playback" : "Play radar frames"}>
                {playing ? "❚❚ PAUSE" : "▶ PLAY"}
              </button>
              <label className="sbMeta">OVERLAY <input type="range" min={20} max={100} value={Math.round(radOp * 100)} onChange={(e) => setRadOp(Number(e.target.value) / 100)} aria-label="Radar overlay opacity" className="mini" /></label>
              <span className={`echoBadge${echoPct != null && echoPct > 0.002 ? " hasEcho" : ""}`} role="status">
                {echoPct == null
                  ? "VERIFYING ECHO COVERAGE…"
                  : echoPct > 0.002
                    ? `SCATTERED ECHOES DETECTED · ${(echoPct * 100).toFixed(1)}% OF CENTER TILE`
                    : "NO DETECTED ECHOES IN VIEWPORT — BLANK MEANS NO PRECIPITATION"}
              </span>
            </div>
            <div className="legendBar legendMini"><span className="legendGrad" /><span>LOW → EXTREME (relative intensity)</span></div>
          </>
        ) : (
          <FailedBox
            source="RainViewer"
            extra={lastGood ? `Last successful observation: ${frameIST(lastGood.time)} (reference only, not live).` : undefined}
            onRetry={() => { if (onRefreshRadar) onRefreshRadar(); else if (onRetry) onRetry(); else setRadRetry((r) => r + 1); }}
          />
        )}
      </figure>

      {/* ============ PRECIPITATION INTENSITY (no calibrated dBZ available) ============ */}
      <figure className="imgCard radCard radDark">
        <div className="vpBanner rad">
          <div>
            <span className="vpKicker">INTENSITY ANALYSIS VIEWPORT</span>
            <b>PRECIPITATION INTENSITY</b>
          </div>
          <StatusBadge status={dispStatus} />
        </div>
        {radarLive && frame ? (
          <>
            <div className="vpStage">
              <RadarMiniMap host={radar.host} path={frame.path} timeLabel={frameIST(frame.time)} lat={lat} lon={lon} label={label} opacity={Math.max(radOp, 0.6)} tall />
              <div className="vpTopTag">PRECIPITATION RADAR · {frameIST(frame.time)} · CURRENT FRAME{echoPct != null && echoPct > 0.002 ? ` · ECHOES ${(echoPct * 100).toFixed(1)}%` : ""}</div>
              <div className="vpBotBar">
                <span>{label.toUpperCase()} {lat.toFixed(2)}, {lon.toFixed(2)}</span>
                <span><button className="tab tabPrimary" onClick={() => setLightbox({ kind: "radar", src: "", title: "Precipitation Intensity" })}>FULLSCREEN ⤢</button></span>
              </div>
            </div>
          </>
        ) : (
          <FailedBox
            source="RainViewer"
            extra={lastGood ? `Last successful observation: ${frameIST(lastGood.time)} (reference only, not live).` : undefined}
            onRetry={() => { if (onRefreshRadar) onRefreshRadar(); else if (onRetry) onRetry(); else setRadRetry((r) => r + 1); }}
          />
        )}
        <div className="legendStrip" aria-label="Precipitation intensity legend">
          <span className="metricLabel">PRECIPITATION INTENSITY (RELATIVE)</span>
          <div className="legendBar"><span className="legendGrad" /></div>
          <div className="legendChips"><span>LOW</span><span>MODERATE</span><span>HEAVY</span><span>EXTREME</span></div>
          <span className="prov">Provider color scale — relative, not calibrated dBZ.</span>
          <span className="prov">100% KEYLESS · RainViewer + OpenStreetMap · NO API KEY REQUIRED.</span>
        </div>
      </figure>

      {lightbox && (
        <div className="drawerWrap" role="dialog" aria-modal="true" aria-label={`${lightbox.title} fullscreen viewer`}>
          <div className="lightbox">
            <div className="sectionHead">
              <div><h2 style={{ fontSize: 18 }}>{lightbox.title}</h2><p>Scientific viewer — zoom · pan · opacity</p></div>
              <button className="tab" onClick={() => { setLightbox(null); setLbOp(1); }} aria-label="Close fullscreen viewer">CLOSE ✕</button>
            </div>
            <div className="lbFrame lbPan">
              {lightbox.kind === "radar" && frame ? (
                <div className="lbMap">
                  <RadarMiniMap host={radar.host} path={frame.path} timeLabel={frameIST(frame.time)} lat={lat} lon={lon} label={label} opacity={lbOp} tall />
                </div>
              ) : lightbox.kind === "sat" && active?.template ? (
                <div className="lbMap">
                  <SatMiniMap template={active.template} product={active.product} date={active.date} lat={lat} lon={lon} label={label} opacity={lbOp} tall showControls />
                </div>
              ) : (
                <FailedBox source={lightbox.kind === "sat" ? "NASA GIBS" : "RainViewer"} onRetry={() => setLightbox(null)} />
              )}
            </div>
            <dl className="lbMeta">
              {lbMeta.map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <div className="vpCtl">
              <label className="sbMeta">OVERLAY OPACITY <input type="range" min={10} max={100} value={Math.round(lbOp * 100)} onChange={(e) => setLbOp(Number(e.target.value) / 100)} aria-label="Image opacity" /></label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
