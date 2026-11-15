"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_LOCATION, type DemoLocation, type SourceStatus } from "@/lib/locations";
import { normalizeNwpModel, type NwpUiModel } from "@/lib/normalize";
import type { EngineOutput } from "@/lib/engine";

export interface ModelRain extends NwpUiModel {}

export interface AnalysisPayload {
  status: SourceStatus;
  label: string;
  lat: number;
  lon: number;
  fetchedAt: string;
  provenance?: { weather: { source: string; time: string; status: SourceStatus }; elevation: { valueM: number | null; status: SourceStatus }; modelsLive: number };
  current?: {
    time: string; timeUnix: number | null; temperature: number; humidity: number;
    precipitationMM15: number | null; precipitationRateMMH: number | null;
    /** @deprecated legacy raw 15-minute amount; use precipitationRateMMH. */
    precipitation: number;
    pressure: number; windSpeed: number; windDir: number; cloudCover: number; soilMoisture: number | null;
  };
  hourly?: { time: string[]; timeUnix?: number[]; precipitation: (number | null)[]; probability: (number | null)[] };
  hourlyGaps?: number;
  accum?: { h1: number | null; h3: number | null; h6: number | null; h12: number | null; h24: number | null; h48: number | null };
  accumCoverage?: { h1: number; h3: number; h6: number; h12: number; h24: number; h48: number };
  daily?: {
    time: string[];
    tmax: (number | null)[];
    tmin: (number | null)[];
    psum: number[];
    pprob: (number | null)[];
  };
  models?: ModelRain[];
  agreement01?: number | null;
  spreadMM?: number | null;
  nwpWindowH?: number;
  nwpWindowNote?: string;
  consensus?: "LOW" | "MODERATE" | "HIGH";
  nwpMean24?: number | null;
  elevationM?: number | null;
  risk?: EngineOutput;
  quality?: { suspect: string[]; note?: string; checks?: { field: string; ok: boolean; note: string }[] };
  warning?: { level: string; score: number; coverage01?: number; validFrom: string; validUntil: string; dedupeKey: string };
  rivers?: { status: string; list: { name: string; kind: string; distKm: number }[]; note: string; source?: string };
  terrain?: { status: string; meanM: number | null; minM?: number | null; maxM?: number | null; reliefM: number | null; lowlandFrac: number | null; note: string; source?: string };
  ml?: {
    p: number | null;
    complete: boolean;
    model: string;
    target: string;
    validation: { pr_auc: number; far: number; events: number; n: number };
    note: string;
  };
  error?: string;
}

export interface RadarState {
  status: SourceStatus;
  host: string;
  past: { time: number; path: string }[];
  nowcast: { time: number; path: string }[];
  generated: number;
  latestAgeMin?: number | null;
  fetchedAt: string;
}

export interface SatLayer {
  id: string;
  satellite: string;
  product: string;
  date: string;
  coverage: string;
  resolution: string;
  status: SourceStatus;
  template?: string;
  frames?: { time: number; path: string }[];
  note?: string;
}

const ANALYSIS_TTL = 10 * 60e3;
const RADAR_TTL = 5 * 60e3;
const SAT_TTL = 60 * 60e3;

async function j<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  const body = (await r.json()) as T;
  return body;
}

export function useDrishti() {
  const [loc, setLoc] = useState<DemoLocation>(DEFAULT_LOCATION);
  const [customLabel, setCustomLabel] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [radar, setRadar] = useState<RadarState>({ status: "READY", host: "", past: [], nowcast: [], generated: 0, fetchedAt: "" });
  const [satLayers, setSatLayers] = useState<SatLayer[]>([]);
  const [health, setHealth] = useState<{ id: string; name: string; kind: string; status: SourceStatus }[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextIn, setNextIn] = useState(ANALYSIS_TTL);
  const timer = useRef<number>(0);
  // Async safety: drop stale responses, never set state after unmount.
  const mounted = useRef(true);
  const analysisSeq = useRef(0);
  const analysisCtl = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      analysisCtl.current?.abort();
    };
  }, []);

  const loadAnalysis = useCallback(async (la: number, lo: number, label: string) => {
    const seq = ++analysisSeq.current;
    analysisCtl.current?.abort();
    const ctl = new AbortController();
    analysisCtl.current = ctl;
    try {
      const a = await j<AnalysisPayload>(`/api/analysis?lat=${la}&lon=${lo}&label=${encodeURIComponent(label)}`, ctl.signal);
      if (!mounted.current || seq !== analysisSeq.current) return; // stale: a newer request won
      // Normalize every model through the single layer: both API shapes,
      // string numerics, NaN/Infinity → null. Drops unparseable entries.
      const models = Array.isArray(a.models)
        ? a.models.map(normalizeNwpModel).filter((m): m is ModelRain => m !== null)
        : undefined;
      setAnalysis({ ...a, models });
    } catch (e) {
      if (!mounted.current || seq !== analysisSeq.current) return;
      if (e instanceof DOMException && e.name === "AbortError") return; // superseded, not a failure
      setAnalysis({ status: "OFFLINE", label, lat: la, lon: lo, fetchedAt: new Date().toISOString(), error: "analysis request failed" });
    }
  }, []);

  const loadRadar = useCallback(async () => {
    try {
      const r = await j<RadarState>("/api/radar");
      setRadar(r);
    } catch {
      setRadar((p) => ({ ...p, status: "OFFLINE" }));
    }
  }, []);

  const loadSat = useCallback(async () => {
    try {
      const s = await j<{ layers: SatLayer[] }>("/api/satellite");
      setSatLayers(s.layers ?? []);
    } catch {
      setSatLayers([]);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const h = await j<{ sources: { id: string; name: string; kind: string; status: SourceStatus }[] }>("/api/data-health");
      setHealth(h.sources ?? []);
    } catch {
      setHealth([]);
    }
  }, []);

  const analyze = useCallback(
    (la: number, lo: number, label: string, preset: DemoLocation | null) => {
      if (preset) {
        setLoc(preset);
        setCustomLabel(null);
      } else {
        setCustomLabel(label);
      }
      setLoading(true);
      void loadAnalysis(la, lo, label).finally(() => {
        if (mounted.current) setLoading(false);
      });
      timer.current = Date.now();
    },
    [loadAnalysis]
  );

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadAnalysis(loc.lat, loc.lon, loc.name), loadRadar(), loadSat(), loadHealth()]).finally(() => {
      if (mounted.current) setLoading(false);
    });
    timer.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const label = customLabel ?? loc.name;
      const la = customLabel ? analysis?.lat ?? loc.lat : loc.lat;
      const lo = customLabel ? analysis?.lon ?? loc.lon : loc.lon;
      void loadAnalysis(la, lo, label);
      void loadRadar();
      timer.current = Date.now();
    }, ANALYSIS_TTL);
    const tick = setInterval(() => setNextIn(Math.max(0, ANALYSIS_TTL - (Date.now() - timer.current))), 1000);
    const satId = setInterval(() => void loadSat(), SAT_TTL);
    const radarId = setInterval(() => void loadRadar(), RADAR_TTL);
    return () => {
      clearInterval(id);
      clearInterval(tick);
      clearInterval(satId);
      clearInterval(radarId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc, customLabel]);

  // Per-module refresh: one card refreshes without touching the others.
  // Each loader is abort/staleness-guarded; failures stay module-local.
  const refreshAnalysis = useCallback(() => {
    const label = customLabel ?? loc.name;
    timer.current = Date.now();
    return loadAnalysis(analysis?.lat ?? loc.lat, analysis?.lon ?? loc.lon, label);
  }, [analysis, customLabel, loc, loadAnalysis]);
  const refreshRadar = useCallback(() => loadRadar(), [loadRadar]);
  const refreshSat = useCallback(() => loadSat(), [loadSat]);

  const refresh = useCallback(() => {
    const label = customLabel ?? loc.name;
    setLoading(true);
    void Promise.all([
      loadAnalysis(analysis?.lat ?? loc.lat, analysis?.lon ?? loc.lon, label),
      loadRadar(),
      loadSat(),
      loadHealth(),
    ]).finally(() => {
      if (mounted.current) setLoading(false);
    });
    timer.current = Date.now();
  }, [analysis, customLabel, loc, loadAnalysis, loadRadar, loadSat, loadHealth]);

  return { loc, customLabel, analysis, radar, satLayers, health, loading, nextIn, analyze, refresh, refreshAnalysis, refreshRadar, refreshSat };
}
