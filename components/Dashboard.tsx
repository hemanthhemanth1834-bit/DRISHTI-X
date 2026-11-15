"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CloudRain, Droplets, Gauge, Percent, ShieldAlert, TrendingUp } from "lucide-react";
import { useDrishti } from "@/hooks/useDrishti";
import { ENGINE_LABEL } from "@/lib/engine";
import type { DemoLocation, SourceStatus } from "@/lib/locations";
import StatusBar from "./StatusBar";
import LocationBar from "./LocationBar";
import RainChart from "./RainChart";
import NwpPanel from "./NwpPanel";
import WarningCard from "./WarningCard";
import XaiPanel from "./XaiPanel";
import type { FabricSource } from "./DataFabric";
import ImageryCards from "./ImageryCards";
import SituationReport from "./SituationReport";
import PipelineTrace from "./PipelineTrace";
import PanelBoundary from "./PanelBoundary";
import ShellHeader from "./ShellHeader";
import LeftRail, { type ShellView } from "./LeftRail";
import RightRail from "./RightRail";
import BottomMetrics from "./BottomMetrics";
import ObservationWorkspace from "./ObservationWorkspace";
import WarningHistory from "./WarningHistory";
import CursorGlow from "./CursorGlow";
import KpiRow, { type Kpi, type KpiTone } from "./KpiRow";
import AlertDetails from "./AlertDetails";
import InundationPanel from "./InundationPanel";
import ModelInsightsView from "./ModelInsightsView";
import DataHealthView from "./DataHealthView";
import TrainingDocsView from "./TrainingDocsView";
import { usePointerMotion } from "@/hooks/usePointerMotion";
import { ageLabel, fmtDay, fmtIST } from "@/lib/format";
import { formatNum, formatPrecip } from "@/lib/normalize";

const LiveMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: () => <p className="unavail">Loading command map…</p> });
const Earth3D = dynamic(() => import("./Earth3D"), {
  ssr: false,
  loading: () => (
    <div className="orbit3d" aria-label="Loading 3D Earth">
      <div className="imgShimmer" />
    </div>
  ),
});

const toneOf = (lvl: string | undefined): KpiTone =>
  lvl === "NORMAL" ? "ok" : lvl === "WATCH" ? "watch" : lvl === "ALERT" ? "alert" : lvl === "SEVERE" ? "severe" : lvl === "EXTREME" ? "extreme" : "muted";

export default function Dashboard() {
  const { loc, customLabel, analysis, radar, satLayers, health, loading, nextIn, analyze, refresh, refreshAnalysis, refreshRadar, refreshSat } =
    useDrishti();
  const [view, setView] = useState<ShellView>("overview");
  const [earthMode, setEarthMode] = useState<"earth" | "map">("earth");
  // Keep-alive: the Earth mounts with the initial Overview and then stays
  // mounted (hidden + paused offscreen) so returning is instant — no chunk
  // reload, no WebGL re-init, no texture re-download.
  const [earthSeen, setEarthSeen] = useState(true);
  const pickView = (v: ShellView) => {
    if (v === "overview") setEarthSeen(true);
    setView((prev) => (prev === v ? prev : v)); // ignore duplicate taps
  };
  // Idle prefetch: warm heavy chunks shortly after first paint so later
  // navigation never waits on network. No data fetching here.
  useEffect(() => {
    const t = setTimeout(() => {
      void import("./Earth3D");
      void import("./LiveMap");
    }, 2000);
    return () => clearTimeout(t);
  }, []);
  usePointerMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const live = analysis?.status === "LIVE";
  const label = customLabel ?? loc.name;
  const lat = analysis?.lat ?? loc.lat;
  const lon = analysis?.lon ?? loc.lon;
  const risk = live && analysis?.risk && analysis.risk.coverage01 > 0 ? analysis.risk : undefined;
  const level = risk?.level ?? "NORMAL";
  const satStatus: SourceStatus = satLayers.length === 0 ? "OFFLINE" : satLayers.some((l) => l.status === "LIVE" || l.status === "RECENT") ? "RECENT" : "OFFLINE";
  const nwpStatus: SourceStatus = (analysis?.provenance?.modelsLive ?? 0) > 0 ? "LIVE" : analysis ? "OFFLINE" : "READY";
  const aiStatus: SourceStatus = live && risk ? "READY" : "OFFLINE";
  const systemStatus: SourceStatus = !analysis
    ? "READY"
    : analysis.status !== "LIVE"
      ? "OFFLINE"
      : radar.status === "LIVE" && satStatus !== "OFFLINE" && nwpStatus === "LIVE"
        ? "LIVE"
        : "DEGRADED";
  const systemLabel = systemStatus === "LIVE" ? "SYSTEM ONLINE" : systemStatus === "DEGRADED" ? "SYSTEM DEGRADED" : systemStatus === "OFFLINE" ? "SYSTEM OFFLINE" : "SYSTEM READY";

  const bar = useMemo(
    () => [
      { label: systemLabel, status: systemStatus },
      { label: "WEATHER", status: (analysis?.status ?? "READY") as SourceStatus },
      { label: "RADAR", status: radar.status },
      { label: "SATELLITE", status: satStatus },
      { label: "NWP", status: nwpStatus },
      { label: "AI", status: aiStatus },
    ],
    [analysis, radar.status, satStatus, nwpStatus, aiStatus, systemLabel, systemStatus]
  );

  const fabric: FabricSource[] = useMemo(() => {
    const h = new Map(health.map((x) => [x.id, x]));
    return [
      { name: "Open-Meteo", kind: "Weather + NWP", status: analysis?.status ?? "READY", source: "api.open-meteo.com (free)", lastUpdate: analysis?.fetchedAt, dataType: "current + hourly + 4 NWP models", resolution: "model-dependent (see NWP panel)" },
      { name: "RainViewer", kind: "Radar tiles", status: radar.status, source: "api.rainviewer.com (free)", lastUpdate: radar.fetchedAt || undefined, dataType: "radar past frames, 10-min interval", resolution: "512px tiles" },
      { name: "NASA GIBS", kind: "Satellite imagery", status: h.get("gibs")?.status ?? satStatus, source: "gibs.earthdata.nasa.gov (free WMTS)", lastUpdate: analysis?.fetchedAt, dataType: "MODIS/VIIRS true color + 7-2-1 false color", resolution: "250–500 m" },
      { name: "MOSDAC / ISRO", kind: "Indian satellite adapter", status: (h.get("mosdac")?.status ?? "AUTH") as SourceStatus, source: "MOSDAC (credentials optional)", dataType: "adapter path only", resolution: "product-dependent" },
      { name: "AI Engine", kind: "Transparent prototype", status: aiStatus, source: "in-repo weighted fusion", dataType: "risk + inundation risk index + warning", resolution: "point analysis" },
      { name: "Inundation", kind: "Model estimate", status: risk ? "READY" : "OFFLINE", source: "rainfall + soil + elevation fusion", lastUpdate: analysis?.fetchedAt, dataType: "uncalibrated risk index + class", resolution: "schematic zones" },
    ];
  }, [analysis, radar, satStatus, health, aiStatus, risk]);

  const healthLive = useMemo(
    () => [...bar.map((b) => b.status), ...health.map((h) => h.status)].filter((s) => s === "LIVE" || s === "RECENT").length,
    [bar, health]
  );

  // KPI rows (reference-matched cards). Values are live or "—" — never fabricated.
  const hourly24 = useMemo(() => ({
    precip: (analysis?.hourly?.precipitation ?? []).slice(0, 24).filter((v): v is number => typeof v === "number"),
    prob: (analysis?.hourly?.probability ?? []).slice(0, 24).filter((v): v is number => typeof v === "number"),
  }), [analysis]);

  const overviewKpis: Kpi[] = [
    {
      icon: <CloudRain size={17} />, label: "Current rainfall",
      value: live ? formatNum(analysis?.current?.precipitationRateMMH, 1) : "—", unit: " mm/h",
      sub: "Open-Meteo model-derived current conditions",
      badge: risk ? level : undefined, tone: risk ? toneOf(level) : "muted",
    },
    {
      icon: <Droplets size={17} />, label: "24h accumulation",
      value: live ? formatNum(analysis?.accum?.h24, 1) : "—", unit: " mm",
      sub: `Σ model hourly series · ${analysis?.accumCoverage?.h24 == null ? "coverage —" : `${Math.round(analysis.accumCoverage.h24 * 100)}% coverage`}`,
      tone: "info",
    },
    {
      icon: <TrendingUp size={17} />, label: "Forecast 24h",
      value: live ? formatNum(analysis?.nwpMean24, 1) : "—", unit: " mm",
      sub: `NWP mean · ${analysis?.provenance?.modelsLive ?? 0}/4 models live`,
      badge: analysis?.nwpMean24 == null ? undefined : analysis.consensus,
      tone: analysis?.nwpMean24 == null ? "muted" : analysis.consensus === "HIGH" ? "ok" : analysis.consensus === "MODERATE" ? "watch" : "alert",
    },
    {
      icon: <ShieldAlert size={17} />, label: "Risk level",
      value: risk ? risk.level : "—",
      sub: risk ? `valid until ${fmtIST(analysis?.warning?.validUntil ?? "")}` : "awaiting live inputs",
      badge: risk ? `score ${risk.score}/100` : undefined, tone: toneOf(risk?.level),
    },
  ];

  const rainfallKpis: Kpi[] = [
    {
      icon: <Droplets size={17} />, label: "Total (24h)",
      value: live ? formatNum(analysis?.accum?.h24, 1) : "—", unit: " mm",
      sub: `${analysis?.accumCoverage?.h24 == null ? "coverage —" : `${Math.round(analysis.accumCoverage.h24 * 100)}% hourly coverage`} · ${analysis?.hourlyGaps ?? 0} gaps disclosed, never zero-filled`,
      badge: risk ? level : undefined, tone: risk ? toneOf(level) : "muted",
    },
    {
      icon: <Gauge size={17} />, label: "Max intensity (24h)",
      value: live && hourly24.precip.length ? formatNum(Math.max(...hourly24.precip), 1) : "—", unit: " mm/h",
      sub: "peak hourly forecast rate",
      tone: "info",
    },
    {
      icon: <Percent size={17} />, label: "Heavy rain probability",
      value: live && hourly24.prob.length ? `${Math.round(Math.max(...hourly24.prob))}` : "—", unit: "%",
      sub: "max rain probability next 24h (Open-Meteo)",
      tone: "info",
    },
    {
      icon: <TrendingUp size={17} />, label: "Model confidence",
      value: analysis?.nwpMean24 == null ? "—" : analysis.consensus ?? "—",
      sub: `agreement ${analysis?.agreement01 == null ? "—" : `${Math.round(analysis.agreement01 * 100)}%`} · spread ${analysis?.spreadMM == null ? "—" : `${analysis.spreadMM.toFixed(1)} mm`}`,
      tone: analysis?.nwpMean24 == null ? "muted" : analysis.consensus === "HIGH" ? "ok" : analysis.consensus === "MODERATE" ? "watch" : "alert",
    },
  ];

  const onPreset = (d: DemoLocation) => analyze(d.lat, d.lon, d.name, d);
  const onSearchPick = (la: number, lon: number, label: string) => analyze(la, lon, label, null);

  // URL state (?lat=&lon=&city=): read once on mount (client-only), then
  // kept in sync so refresh never loses the selected city.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const laStr = sp.get("lat");
      const loStr = sp.get("lon");
      // Missing params are null — and Number(null) === 0, which would
      // silently select coordinates 0,0. Null always means "absent" here.
      if (laStr == null || loStr == null || laStr === "" || loStr === "") return;
      const la = Number(laStr);
      const lo = Number(loStr);
      const city = (sp.get("city") ?? "").slice(0, 80);
      if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
        analyze(la, lo, city || `${la.toFixed(2)}, ${lo.toFixed(2)}`, null);
      }
    } catch {
      /* URL unavailable — default location stands */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      const la = analysis?.lat ?? loc.lat;
      const lo = analysis?.lon ?? loc.lon;
      const label = customLabel ?? loc.name;
      window.history.replaceState(null, "", `?lat=${la.toFixed(4)}&lon=${lo.toFixed(4)}&city=${encodeURIComponent(label)}`);
    } catch {
      /* ignore */
    }
  }, [analysis?.lat, analysis?.lon, customLabel, loc]);
  const mapProps = {
    lat, lon, label, radar, satLayers, level, inundRisk: risk?.inundation.riskIndex ?? 0,
    onCity: (la: number, lo: number, name: string) => analyze(la, lo, name, null),
  };

  return (
    <main className="shApp">
      <CursorGlow />
      <div className="noise" />
      <div className="grid" />
      <ShellHeader loc={loc} customLabel={customLabel} onSelect={onPreset} onSearchPick={onSearchPick} systemLive={bar} />
      <div className="shBody">
        <LeftRail view={view} onView={pickView} />
        <section className="shCenter" id="shCenter" aria-label="Central visualization">
          <StatusBar items={bar} lastUpdated={analysis?.fetchedAt ?? ""} nextIn={nextIn} onRefresh={refresh} loading={loading} />

          {view === "overview" && (
            <>
              <KpiRow items={overviewKpis} />
              <div className="centerTabs" role="group" aria-label="Central view">
                <button className={`tab${earthMode === "earth" ? " active" : ""}`} onClick={() => setEarthMode("earth")}>3D EARTH</button>
                <button className={`tab${earthMode === "map" ? " active" : ""}`} onClick={() => setEarthMode("map")}>MAP</button>
                <span className="sbMeta">{label} · {lat.toFixed(2)}, {lon.toFixed(2)} · {fmtIST(analysis?.fetchedAt ?? "")} ({ageLabel(analysis?.fetchedAt)})</span>
              </div>
              {earthMode === "earth" ? (
                reduced ? (
                  <div className="orbit" aria-hidden>
                    <div className="earth"><div className="clouds" /><div className="rain" /></div>
                    <div className="radarRing" /><div className="radarRing two" /><div className="radarRing three" />
                  </div>
                ) : earthSeen || view === "overview" ? (
                  <div
                    className="heroVis"
                    style={view === "overview" ? undefined : { display: "none" }}
                    aria-hidden={view === "overview" ? undefined : true}
                  >
                    <Earth3D
                      level={level}
                      rain={analysis?.current?.precipitationRateMMH ?? 0}
                      lat={lat}
                      lon={lon}
                      label={label}
                      gibsDate={satLayers.find((l) => l.id === "viirs-truecolor")?.date ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10)}
                      radarStatus={radar.status}
                      paused={view !== "overview"}
                      frameTime={
                        radar.past.length
                          ? fmtIST(new Date(radar.past[radar.past.length - 1].time * 1000).toISOString())
                          : "—"
                      }
                    />
                    <p className="prov" style={{ textAlign: "center" }}>AI/ML SYSTEM VISUALIZATION — procedural rainfall monitoring render, not a satellite observation.</p>
                  </div>
                ) : null
              ) : (
                <div className="panel mapPanel shMap">
                  <div className="panelTitle"><strong>Rainfall + radar + satellite + inundation</strong><span className="live">● {label}</span></div>
                  <PanelBoundary name="MAP"><LiveMap {...mapProps} /></PanelBoundary>
                </div>
              )}
              <PipelineTrace
                stages={[
                  { name: "Satellite", status: satStatus, note: "GIBS recent" },
                  { name: "Radar", status: radar.status, note: `${radar.past.length} frames` },
                  { name: "Current conditions", status: analysis?.status ?? "READY", note: "Open-Meteo model-derived" },
                  { name: "NWP", status: nwpStatus, note: `${analysis?.provenance?.modelsLive ?? 0}/4` },
                  { name: "AI/ML", status: aiStatus, note: "prototype · weighted fusion" },
                  { name: "Rainfall risk", status: risk ? "LIVE" : "OFFLINE", note: risk ? `${risk.score} · coverage ${Math.round(risk.coverage01 * 100)}%` : "—" },
                  { name: "Inundation", status: risk ? "READY" : "OFFLINE", note: risk ? `index ${risk.inundation.riskIndex} · ${risk.inundation.class}` : "—" },
                  { name: "Warning", status: live ? "LIVE" : "OFFLINE", note: risk ? risk.level : "—" },
                ]}
              />
              <LocationBar current={loc} customLabel={customLabel} onAnalyze={analyze} />
            </>
          )}

          {view === "gis" && (
            <div className="viewStack">
              <div className="panel mapPanel gisMap">
                <div className="panelTitle"><strong>GIS map — multi-layer view</strong><span className="live">● {label} · {lat.toFixed(2)}, {lon.toFixed(2)}</span></div>
                <PanelBoundary name="MAP"><LiveMap {...mapProps} /></PanelBoundary>
              </div>
              <p className="prov" style={{ margin: 0 }}>
                Layers: radar nowcast (RainViewer), satellite imagery (NASA GIBS), terrain base (OpenTopoMap/OSM), model-estimate inundation circle (not observed flood extent). Rivers/boundaries layers are not connected — no geometry dataset; river names within ~25 km appear in Inundation Analysis.
              </p>
            </div>
          )}

          {view === "rainfall" && (
            <div className="viewStack">
              <KpiRow items={rainfallKpis} />
              <div className="panel chartPanel chartLarge">
                <PanelBoundary name="RAINFALL CHART"><RainChart hourly={analysis?.hourly} gaps={analysis?.hourlyGaps} onRefresh={() => void refreshAnalysis()} /></PanelBoundary>
              </div>
              <div className="panel curPanel">
                <div className="metricLabel">Accumulation windows — calculated from live hourly series (mm)</div>
                <div className="accGrid">
                  {(["h1", "h3", "h6", "h12", "h24", "h48"] as const).map((k) => (
                    <div key={k}><dt>{k.toUpperCase()}</dt><dd>{live ? formatPrecip(analysis?.accum?.[k]) : "—"}</dd></div>
                  ))}
                </div>
                {analysis?.daily && analysis.daily.time.length > 0 && (
                  <>
                    <div className="metricLabel" style={{ marginTop: 14 }}>Daily outlook — Open-Meteo daily (next days)</div>
                    <div className="dayRow">
                      {analysis.daily.time.map((t, i) => (
                        <div key={t} className="dayCard">
                          <span>{fmtDay(t)}</span>
                          <b>{analysis.daily?.tmax?.[i] == null ? "—" : `${Math.round(analysis.daily.tmax[i] as number)}°`} <em>/ {analysis.daily?.tmin?.[i] == null ? "—" : `${Math.round(analysis.daily.tmin[i] as number)}°`}</em></b>
                          <span>rain {formatPrecip(analysis.daily?.psum?.[i])}</span>
                          <span>prob {analysis.daily?.pprob?.[i] == null ? "—" : `${Math.round(analysis.daily.pprob[i] as number)}%`}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <LocationBar current={loc} customLabel={customLabel} onAnalyze={analyze} />
            </div>
          )}

          {view === "inundation" && (
            <div className="viewStack">
              <div className="inundGrid2">
                <div className="panel mapPanel shMap" style={{ height: 560 }}>
                  <div className="panelTitle"><strong>Inundation prediction — model estimate zones</strong><span className="live">● {label}</span></div>
                  <PanelBoundary name="MAP"><LiveMap {...mapProps} /></PanelBoundary>
                </div>
                <InundationPanel analysis={analysis} live={live} label={label} />
              </div>
            </div>
          )}

          {view === "satellite" && (
            <div className="viewStack">
              <PanelBoundary name="SATELLITE IMAGERY">
                <ImageryCards layers={satLayers} lat={lat} lon={lon} label={label} radar={radar} modelCtx={{ h24: analysis?.accum?.h24 ?? null, level: risk?.level ?? "—" }} onRetry={refresh} onRefreshRadar={() => void refreshRadar()} onRefreshSat={() => void refreshSat()} />
              </PanelBoundary>
              <PanelBoundary name="WORKSPACE">
                <ObservationWorkspace analysis={analysis} live={live} label={label} radar={radar} satLayers={satLayers} />
              </PanelBoundary>
            </div>
          )}

          {view === "models" && (
            <ModelInsightsView analysis={analysis} live={live} label={label} onRefreshAnalysis={() => void refreshAnalysis()} />
          )}

          {view === "data" && (
            <DataHealthView analysis={analysis} radar={radar} satLayers={satLayers} health={health} live={live} onRefresh={refresh} />
          )}

          {view === "training" && <TrainingDocsView />}

          {view === "alerts" && (
            <div className="alertGrid">
              <div className="alertCol">
                <WarningCard label={label} accum={analysis?.accum} risk={risk} live={live} validUntil={analysis?.warning?.validUntil} />
                <WarningHistory level={risk?.level} score={risk?.score} label={label} />
              </div>
              <div className="alertCol">
                <AlertDetails analysis={analysis} live={live} label={label} />
                <XaiPanel risk={risk} live={live} ml={analysis?.ml ?? null} />
              </div>
            </div>
          )}

          {view === "reports" && (
            <div className="viewStack">
              <SituationReport analysis={analysis} live={live} label={label} lat={lat} lon={lon} fabric={fabric} />
            </div>
          )}
        </section>
        <RightRail analysis={analysis} live={live} label={label} lat={lat} lon={lon} satLayers={satLayers} onOpenSatellite={() => setView("satellite")} />
      </div>
      <BottomMetrics analysis={analysis} live={live} healthLive={healthLive} healthTotal={bar.length + health.length} onPick={(la, lo, name) => analyze(la, lo, name, null)} />
      <p className="shFoot">DRISHTI-X • SIH PS-26071 • {ENGINE_LABEL} — research analysis, not official IMD warnings.</p>
    </main>
  );
}
