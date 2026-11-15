import { NextResponse } from "next/server";
import { NWP_MODELS, fetchElevation, fetchModelPrecip, fetchWeather, validCoords, type ModelSeries } from "@/lib/providers";
import { agreementOf, computeRisk, consensusConfidence, spreadOf, type ModelRainInput } from "@/lib/engine";
import { qualityReport } from "@/lib/quality";
import { fetchRivers } from "@/lib/rivers";
import { buildMlFeatures, mlHeavyProbability, ML_VERSION, ML_HEAVY_MM, ML_VALIDATION } from "@/lib/ml";
import { sampleTerrain } from "./terrain";

export const revalidate = 600;
export const dynamic = "force-dynamic";

function sumWindow(arr: (number | null)[], nowIdx: number, hours: number, past = false): number {
  let s = 0;
  if (past) {
    for (let i = Math.max(0, nowIdx - hours); i < nowIdx; i++) s += arr[i] ?? 0;
  } else {
    for (let i = nowIdx; i < Math.min(arr.length, nowIdx + hours); i++) s += arr[i] ?? 0;
  }
  return Math.round(s * 10) / 10;
}

/** Nulls are skipped by sums but counted: gaps are reported, never zero-filled silently. */
function countGaps(arr: (number | null)[], nowIdx: number, hours: number): number {
  let n = 0;
  for (let i = nowIdx; i < Math.min(arr.length, nowIdx + hours); i++) if (arr[i] == null) n++;
  return n;
}

/**
 * Common-window alignment: model grids cover ~48h from local midnight, so the
 * comparable window is the intersection of the requested future hours with
 * every RESPONDING model grid (identical timestamps for those models, never
 * zero-filled). A model that failed to respond is reported OFFLINE on its own
 * and does not collapse the comparison window for the others.
 */
function commonWindow(future: string[], series: (ModelSeries | null)[]): { times: string[]; live: boolean[] } {
  const present = series.filter((s): s is ModelSeries => s != null);
  const sets = present.map((s) => new Set(s.times));
  const times = sets.length === 0 ? [] : future.filter((t) => sets.every((set) => set.has(t))).slice(0, 48);
  const live = series.map((s) => {
    if (!s) return false;
    const set = new Set(s.times);
    return times.length >= 12 && times.every((t) => set.has(t));
  });
  return { times, live };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat") ?? "16.5062");
  const lon = Number(searchParams.get("lon") ?? "80.648");
  const label = searchParams.get("label") ?? `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!validCoords(lat, lon)) {
    return NextResponse.json({ status: "OFFLINE", error: "invalid coordinates: expected lat −90…90, lon −180…180" }, { status: 400 });
  }
  const fetchedAt = new Date().toISOString();
  try {
    // River context resolves concurrently and never blocks the analysis.
    const [wx, elev, rivers, terrain, ...modelSets] = await Promise.all([
      fetchWeather(lat, lon),
      fetchElevation(lat, lon),
      fetchRivers(lat, lon).catch(
        (): { status: "OFFLINE"; rivers: []; note: string } => ({ status: "OFFLINE", rivers: [], note: "River lookup offline." })
      ),
      sampleTerrain(lat, lon).catch(() => ({
        status: "OFFLINE" as const, meanM: null, minM: null, maxM: null, reliefM: null,
        lowlandFrac: null, zoom: 12, note: "Terrain tiles unavailable.",
      })),
      ...NWP_MODELS.map((m) => fetchModelPrecip(lat, lon, m.id).catch(() => null as ModelSeries | null)),
    ]);
    const times = wx.hourly.time;
    let nowIdx = times.findIndex((t) => new Date(t).getTime() > Date.now() - 30 * 60e3);
    if (nowIdx < 0) nowIdx = 0;
    const P = wx.hourly.precipitation ?? [];
    const PP = wx.hourly.precipitation_probability ?? [];
    const futureTimes = times.slice(nowIdx, nowIdx + 48);
    const common = commonWindow(futureTimes, modelSets);

    const models: ModelRainInput[] = NWP_MODELS.map((m, i) => {
      const s = modelSets[i];
      const ok = s != null && common.live[i];
      if (!ok || !s) {
        return { model: m.id, label: m.label, resolution: m.resolution, precipMM24: 0, maxIntensityMMH: 0, status: "OFFLINE" as const };
      }
      const idx = new Map(s.times.map((t, k) => [t, k] as [string, number]));
      const vals: (number | null)[] = common.times.map((t) => s.values[idx.get(t) ?? -1] ?? null);
      const d24 = vals.slice(0, 24).filter((v): v is number => typeof v === "number");
      if (d24.length === 0) {
        // Model responded but carried no usable values: unavailable, never zero.
        return { model: m.id, label: m.label, resolution: m.resolution, precipMM24: 0, maxIntensityMMH: 0, status: "OFFLINE" as const };
      }
      return {
        model: m.id,
        label: m.label,
        resolution: m.resolution,
        // Canonical UI field (matches /api/nwp). precipMM24 kept for the engine input type.
        precipMM: Math.round(d24.reduce((a, x) => a + x, 0) * 10) / 10,
        precipMM24: Math.round(d24.reduce((a, x) => a + x, 0) * 10) / 10,
        maxIntensityMMH: Math.round(Math.max(...d24) * 10) / 10,
        status: "LIVE" as const,
      };
    });
    const liveVals = models.filter((m) => m.status === "LIVE").map((m) => m.precipMM24);
    const agreement01 = Math.round(agreementOf(liveVals) * 100) / 100;
    const spreadMM = spreadOf(liveVals);
    const nwpMean24 = liveVals.length ? Math.round((liveVals.reduce((s, v) => s + v, 0) / liveVals.length) * 10) / 10 : 0;
    const consensus = consensusConfidence(liveVals.length, spreadMM, nwpMean24);
    const c = wx.current;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const soil = wx.hourly.soil_moisture_3_9cm?.[nowIdx];
    // Plausibility gates: suspect values become missing (renormalized + disclosed).
    const quality = qualityReport({
      temperature: num(c.temperature_2m),
      humidity: num(c.relative_humidity_2m),
      pressure: num(c.pressure_msl),
      windSpeed: num(c.wind_speed_10m),
      rainRate: num(c.precipitation),
      cloudCover: num(c.cloud_cover),
      soilMoisture: typeof soil === "number" ? soil : null,
    });
    const suspect = new Set(quality.suspect);
    const qv = (k: string, v: number | null): number | null => (suspect.has(k) ? null : v);
    const risk = computeRisk({
      rainRateMMH: qv("rainRate", num(c.precipitation)),
      accum1: sumWindow(P, nowIdx, 1),
      accum3: sumWindow(P, nowIdx, 3),
      accum6: sumWindow(P, nowIdx, 6),
      accum12: sumWindow(P, nowIdx, 12),
      accum24: sumWindow(P, nowIdx, 24),
      accum48: sumWindow(P, nowIdx, 48),
      antecedent24: sumWindow(P, nowIdx, 24, true),
      precipProbMax: (() => {
        const ps = PP.slice(nowIdx, nowIdx + 24).filter((v): v is number => typeof v === "number");
        return ps.length ? Math.max(...ps) : null;
      })(),
      humidity: qv("humidity", num(c.relative_humidity_2m)),
      pressureMSL: qv("pressure", num(c.pressure_msl)),
      soilMoisture: qv("soilMoisture", typeof soil === "number" ? soil : null),
      elevationM: elev,
      agreement01,
      nwpMean24,
      radarStatus: "READY",
    });
    // Drainage context (display only — the score does not ingest it; the
    // engine signature is unchanged so this stays a labelled indicator).
    for (const rv of rivers.rivers.slice(0, 3)) {
      risk.inundation.factors.push({ name: `River: ${rv.name}`, value: `${rv.kind} · ~${rv.distKm} km` });
    }
    if (terrain.status === "READY") {
      risk.inundation.factors.push(
        { name: "Terrain mean elevation (DEM)", value: `${terrain.meanM} m` },
        { name: "Terrain relief / lowland", value: `std ${terrain.reliefM} m · <25m ${(terrain.lowlandFrac as number) * 100}%` }
      );
      risk.inundation.terrainNote += ` Terrarium DEM: ${terrain.note}`;
    }
    // Experimental ML signal: exact TS port of the validated logreg weights
    // over live past-24h history. Display-only; NEVER feeds the warning score.
    const pastHourly: (number | null)[] = [];
    for (let l = 1; l <= 24; l++) pastHourly[l] = nowIdx - l >= 0 ? P[nowIdx - l] : null;
    const mlFeat = buildMlFeatures(pastHourly, new Date(fetchedAt).getUTCHours());
    const ml =
      mlFeat == null
        ? { p: null, complete: false, model: `logreg_bal ${ML_VERSION}`, target: `P(precip t+6h >= ${ML_HEAVY_MM}mm)`, validation: ML_VALIDATION, note: "Insufficient history for ML features." }
        : {
            p: Math.round(mlHeavyProbability(mlFeat) * 10000) / 10000,
            complete: true,
            model: `logreg_bal ${ML_VERSION}`,
            target: `P(precip t+6h >= ${ML_HEAVY_MM}mm)`,
            validation: ML_VALIDATION,
            note: "Experimental, unvalidated for operations (high false-alarm rate). Display only.",
          };
    return NextResponse.json({
      status: "LIVE",
      label,
      lat,
      lon,
      fetchedAt,
      units: {
        precipitation: "mm",
        intensity: "mm/h",
        temperature: "°C",
        pressure: "hPa",
        wind: "km/h",
        soilMoisture: "m³/m³ (provider-native)",
        coordinates: "decimal degrees",
        time: "location-local ISO (IST for India scope); UTC in fetchedAt",
      },
      provenance: {
        weather: { source: "Open-Meteo forecast API (free, no key)", time: c.time, status: "LIVE" as const },
        elevation: { source: "Open-Meteo elevation API (free, no key)", valueM: elev, status: elev == null ? ("OFFLINE" as const) : ("LIVE" as const) },
        nwpRunNote: "Open-Meteo does not publish per-model run/init timestamps; 24h windows are aligned on common forecast timestamps instead.",
        modelsLive: liveVals.length,
        modelsTotal: NWP_MODELS.length,
      },
      current: {
        time: c.time,
        temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        precipitation: c.precipitation,
        pressure: c.pressure_msl,
        windSpeed: c.wind_speed_10m,
        windDir: c.wind_direction_10m,
        cloudCover: c.cloud_cover,
        soilMoisture: typeof soil === "number" ? soil : null,
      },
      hourly: {
        time: futureTimes,
        precipitation: P.slice(nowIdx, nowIdx + 48),
        probability: PP.slice(nowIdx, nowIdx + 48),
      },
      hourlyGaps: countGaps(P, nowIdx, 48),
      accum: {
        h1: sumWindow(P, nowIdx, 1),
        h3: sumWindow(P, nowIdx, 3),
        h6: sumWindow(P, nowIdx, 6),
        h12: sumWindow(P, nowIdx, 12),
        h24: sumWindow(P, nowIdx, 24),
        h48: sumWindow(P, nowIdx, 48),
      },
      daily: {
        time: (wx.daily?.time ?? []).slice(0, 7),
        tmax: (wx.daily?.temperature_2m_max ?? []).slice(0, 7),
        tmin: (wx.daily?.temperature_2m_min ?? []).slice(0, 7),
        psum: (wx.daily?.precipitation_sum ?? []).slice(0, 7),
        pprob: (wx.daily?.precipitation_probability_max ?? []).slice(0, 7),
      },
      models,
      agreement01,
      spreadMM,
      consensus,
      nwpWindowH: common.times.length,
      nwpWindowNote:
        common.times.length >= 24
          ? `Models compared over identical ${common.times.length}h common window from forecast start.`
          : "Common model window shorter than 24h; sums cover the identical available window.",
      nwpMean24,
      elevationM: elev,
      risk,
      rivers: {
        status: rivers.status,
        list: rivers.rivers,
        note: rivers.note,
        source: "OpenStreetMap Overpass API (free, no key)",
      },
      terrain: {
        ...terrain,
        source: "AWS TerrainRGB Terrarium tiles (free, no key)",
      },
      ml,
      quality: {
        suspect: quality.suspect,
        checks: quality.checks,
        note: quality.suspect.length
          ? `Suspect inputs excluded and weights renormalized: ${quality.suspect.join(", ")}.`
          : "All inputs within documented physical ranges.",
      },
      warning: {
        level: risk.level,
        score: risk.score,
        validFrom: fetchedAt,
        validUntil: new Date(new Date(fetchedAt).getTime() + 3 * 3600e3).toISOString(),
        dedupeKey: `${lat.toFixed(2)},${lon.toFixed(2)}:${risk.level}:${Math.round(sumWindow(P, nowIdx, 6))}mm-6h`,
        thresholds: "DRISHTI-X AI-assisted thresholds (research; not IMD official thresholds)",
        disclaimer: "AI-assisted analysis. Not an official IMD warning. No emergency notifications are sent.",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { status: "OFFLINE", label, lat, lon, fetchedAt, error: `weather upstream failure: ${String(e)}` },
      { status: 502 }
    );
  }
}
