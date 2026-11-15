import { NextResponse } from "next/server";
import { NWP_MODELS, fetchElevation, fetchModelPrecip, fetchRadar, fetchWeather, validCoords, type ModelSeries } from "@/lib/providers";
import { agreementOf, computeRisk, consensusConfidence, spreadOf, type ModelRainInput } from "@/lib/engine";
import { qualityReport } from "@/lib/quality";
import { fetchRivers } from "@/lib/rivers";
import { buildMlFeatures, mlHeavyProbability, ML_VERSION, ML_HEAVY_MM, ML_VALIDATION } from "@/lib/ml";
import { amountToRate } from "@/lib/normalize";
import { sumWindow } from "@/lib/accum";
import { radarHealth } from "@/lib/radar";
import { istHourFromUnix } from "@/lib/time";
import { sampleTerrain } from "./terrain";

export const revalidate = 600;
export const dynamic = "force-dynamic";
// Bounded provider fan-out: weather retry (≤14s) + terrain (≤12s) run in
// parallel, but this leaves headroom for slow upstreams on serverless.
export const maxDuration = 30;

/**
 * Common-window alignment by Unix second: identical real instants for every
 * responding model regardless of server/browser timezone. A model that failed
 * to respond is OFFLINE on its own and never collapses the others' window.
 */
function commonWindow(futureUnix: number[], series: (ModelSeries | null)[]): { unix: number[]; live: boolean[] } {
  const present = series.filter((s): s is ModelSeries => s != null);
  const sets = present.map((s) => new Set(s.timeUnix.filter((t): t is number => typeof t === "number")));
  const unix = sets.length === 0 ? [] : futureUnix.filter((t) => sets.every((set) => set.has(t))).slice(0, 48);
  const live = series.map((s) => {
    if (!s) return false;
    const set = new Set(s.timeUnix.filter((t): t is number => typeof t === "number"));
    return unix.length >= 12 && unix.every((t) => set.has(t));
  });
  return { unix, live };
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
    // Independent sources resolve concurrently; optional context never blocks
    // the core weather/risk response.
    const [wx, elev, rivers, terrain, radarMeta, ...modelSets] = await Promise.all([
      fetchWeather(lat, lon),
      fetchElevation(lat, lon),
      fetchRivers(lat, lon).catch(
        (): { status: "OFFLINE"; rivers: []; note: string } => ({ status: "OFFLINE", rivers: [], note: "River lookup offline." })
      ),
      sampleTerrain(lat, lon).catch(() => ({
        status: "OFFLINE" as const, meanM: null, minM: null, maxM: null, reliefM: null,
        lowlandFrac: null, zoom: 12, note: "Terrain tiles unavailable.",
      })),
      fetchRadar().catch(() => null),
      ...NWP_MODELS.map((m) => fetchModelPrecip(lat, lon, m.id).catch(() => null as ModelSeries | null)),
    ]);

    const nowSec = Date.now() / 1000;
    let nowIdx = wx.hourly.timeUnix.findIndex((t) => typeof t === "number" && t > nowSec - 30 * 60);
    if (nowIdx < 0) nowIdx = 0;
    const P = wx.hourly.precipitation ?? [];
    const PP = wx.hourly.precipitation_probability ?? [];
    // Pair ISO, Unix and values once; drop only rows without a computable time.
    const forecast = wx.hourly.time
      .map((iso, i) => ({ iso, unix: wx.hourly.timeUnix[i], p: P[i] ?? null, pp: PP[i] ?? null }))
      .slice(nowIdx)
      .filter((row): row is { iso: string; unix: number; p: number | null; pp: number | null } => typeof row.unix === "number")
      .slice(0, 48);
    const futureUnix = forecast.map((row) => row.unix);
    const futureTimes = forecast.map((row) => new Date(row.unix * 1000).toISOString());
    const futureP = forecast.map((row) => row.p);
    const futurePP = forecast.map((row) => row.pp);
    const common = commonWindow(futureUnix, modelSets);

    const models: ModelRainInput[] = NWP_MODELS.map((m, i) => {
      const s = modelSets[i];
      const ok = s != null && common.live[i];
      if (!ok || !s) {
        return {
          model: m.id, label: m.label, resolution: m.resolution,
          precipMM24: null, precipMM: null, maxIntensityMMH: null, status: "OFFLINE" as const,
        };
      }
      const idx = new Map<number, number>();
      s.timeUnix.forEach((t, k) => { if (typeof t === "number") idx.set(t, k); });
      const vals: (number | null)[] = common.unix.map((t) => {
        const k = idx.get(t);
        return k == null ? null : s.values[k] ?? null;
      });
      const d24 = vals.slice(0, 24);
      // A 24h total is available only when all 24 values exist. Never sum a
      // partial window and call it 24h rainfall.
      const complete24 = d24.length === 24 && d24.every((v): v is number => typeof v === "number");
      const finite = vals.filter((v): v is number => typeof v === "number");
      const total24 = complete24 ? Math.round((d24 as number[]).reduce((a, x) => a + x, 0) * 10) / 10 : null;
      return {
        model: m.id,
        label: m.label,
        resolution: m.resolution,
        precipMM: total24,
        precipMM24: total24,
        maxIntensityMMH: finite.length ? Math.round(Math.max(...finite) * 10) / 10 : null,
        status: "LIVE" as const,
      };
    });
    const liveVals = models
      .filter((m) => m.status === "LIVE" && typeof m.precipMM24 === "number")
      .map((m) => m.precipMM24 as number);
    const agreement01 = liveVals.length >= 2 ? Math.round(agreementOf(liveVals) * 100) / 100 : null;
    const spreadMM = liveVals.length >= 2 ? spreadOf(liveVals) : null;
    const nwpMean24 = liveVals.length
      ? Math.round((liveVals.reduce((s, v) => s + v, 0) / liveVals.length) * 10) / 10
      : null;
    const consensus = consensusConfidence(liveVals.length, spreadMM ?? 0, nwpMean24 ?? 0);
    const radar = radarHealth(radarMeta);

    const c = wx.current;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const soil = wx.hourly.soil_moisture_3_9cm?.[nowIdx];
    const currentAmountMM15 = num(c.precipitation);
    const currentRateMMH = amountToRate(currentAmountMM15);
    // Plausibility gates: suspect values become missing (renormalized + disclosed).
    const quality = qualityReport({
      temperature: num(c.temperature_2m),
      humidity: num(c.relative_humidity_2m),
      pressure: num(c.pressure_msl),
      windSpeed: num(c.wind_speed_10m),
      rainRate: currentRateMMH,
      cloudCover: num(c.cloud_cover),
      soilMoisture: typeof soil === "number" ? soil : null,
    });
    const suspect = new Set(quality.suspect);
    const qv = (k: string, v: number | null): number | null => (suspect.has(k) ? null : v);

    const w1 = sumWindow(P, nowIdx, 1);
    const w3 = sumWindow(P, nowIdx, 3);
    const w6 = sumWindow(P, nowIdx, 6);
    const w12 = sumWindow(P, nowIdx, 12);
    const w24 = sumWindow(P, nowIdx, 24);
    const w48 = sumWindow(P, nowIdx, 48);
    const wPast24 = sumWindow(P, nowIdx, 24, true);
    const accum = { h1: w1.value, h3: w3.value, h6: w6.value, h12: w12.value, h24: w24.value, h48: w48.value };
    const accumCoverage = {
      h1: w1.coverage01, h3: w3.coverage01, h6: w6.coverage01,
      h12: w12.coverage01, h24: w24.coverage01, h48: w48.coverage01,
    };

    const risk = computeRisk({
      rainRateMMH: qv("rainRate", currentRateMMH),
      accum1: w1.value,
      accum3: w3.value,
      accum6: w6.value,
      accum12: w12.value,
      accum24: w24.value,
      accum48: w48.value,
      antecedent24: wPast24.value,
      precipProbMax: (() => {
        const ps = futurePP.slice(0, 24).filter((v): v is number => typeof v === "number");
        return ps.length ? Math.max(...ps) : null;
      })(),
      humidity: qv("humidity", num(c.relative_humidity_2m)),
      pressureMSL: qv("pressure", num(c.pressure_msl)),
      soilMoisture: qv("soilMoisture", typeof soil === "number" ? soil : null),
      elevationM: elev,
      agreement01,
      nwpMean24,
      radarStatus: radar.status,
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
    const mlFeat = buildMlFeatures(
      pastHourly,
      istHourFromUnix(c.timeUnix ?? Math.floor(new Date(fetchedAt).getTime() / 1000))
    );
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
        precipitation: "mm (hourly amounts); current amount is a 15-minute mm total",
        intensity: "mm/h (converted from the 15-minute current amount)",
        temperature: "°C",
        pressure: "hPa",
        wind: "km/h",
        soilMoisture: "m³/m³ (provider-native)",
        coordinates: "decimal degrees",
        time: "UTC ISO timestamps (timeUnix also supplied); UI renders IST",
      },
      provenance: {
        weather: {
          source: "Open-Meteo forecast API (free, no key)",
          time: c.timeUnix == null ? null : new Date(c.timeUnix * 1000).toISOString(),
          timeLocal: c.time,
          timeUnix: c.timeUnix,
          status: "LIVE" as const,
          note: "Model-derived current conditions — not a ground observation.",
        },
        elevation: { source: "Open-Meteo elevation API (free, no key)", valueM: elev, status: elev == null ? ("OFFLINE" as const) : ("LIVE" as const) },
        nwpRunNote: "Open-Meteo does not publish per-model run/init timestamps; 24h windows are aligned on common forecast Unix timestamps instead.",
        modelsLive: liveVals.length,
        modelsTotal: NWP_MODELS.length,
        radar: { status: radar.status, latestAgeMin: radar.latestAgeMin },
      },
      current: {
        time: c.timeUnix == null ? null : new Date(c.timeUnix * 1000).toISOString(),
        timeLocal: c.time,
        timeUnix: c.timeUnix,
        temperature: c.temperature_2m,
        humidity: c.relative_humidity_2m,
        precipitationMM15: currentAmountMM15,
        precipitationRateMMH: currentRateMMH,
        // Legacy field retained for older clients; UI must use the explicit fields.
        precipitation: currentAmountMM15,
        pressure: c.pressure_msl,
        windSpeed: c.wind_speed_10m,
        windDir: c.wind_direction_10m,
        cloudCover: c.cloud_cover,
        soilMoisture: typeof soil === "number" ? soil : null,
      },
      hourly: {
        time: futureTimes,
        timeUnix: futureUnix,
        precipitation: futureP,
        probability: futurePP,
      },
      hourlyGaps: futureP.filter((v) => v == null).length,
      accum,
      accumCoverage,
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
      nwpWindowH: common.unix.length,
      nwpWindowNote:
        common.unix.length >= 24
          ? `Models compared over identical ${common.unix.length}h common window from forecast start.`
          : "Common model window shorter than 24h; sums cover only a complete identical window (otherwise null).",
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
        // A zero-coverage score is not a normal warning; keep it distinct in
        // the API contract even though the internal score defaults to 0.
        level: risk.coverage01 > 0 ? risk.level : "UNKNOWN",
        score: risk.score,
        coverage01: risk.coverage01,
        validFrom: fetchedAt,
        validUntil: new Date(new Date(fetchedAt).getTime() + 3 * 3600e3).toISOString(),
        dedupeKey: `${lat.toFixed(2)},${lon.toFixed(2)}:${risk.coverage01 > 0 ? risk.level : "UNKNOWN"}:${accum.h6 == null ? "incomplete" : `${accum.h6}mm-6h`}`,
        thresholds: "DRISHTI-X AI-assisted thresholds (research; not IMD official thresholds)",
        disclaimer: "AI-assisted analysis. Not an official IMD warning. No emergency notifications are sent.",
      },
    });
  } catch (e) {
    console.error("analysis upstream failure", e);
    return NextResponse.json(
      { status: "OFFLINE", label, lat, lon, fetchedAt, error: "weather upstream failure" },
      { status: 502 }
    );
  }
}
