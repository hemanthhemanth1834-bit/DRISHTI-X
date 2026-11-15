/** Server-side free-data providers. Only imported by app/api routes. */
import { amountToRate, CURRENT_PRECIP_INTERVAL_MIN } from "@/lib/normalize";
import { toUnixSeconds } from "@/lib/time";

const UA = { "User-Agent": "DRISHTI-X-PS26071 research demo (SIH)" };
const UPSTREAM_TIMEOUT_MS = 7000;

/**
 * Cached upstream fetch with a hard timeout and one retry for transient
 * failures (network / 429 / 5xx). 4xx responses are not retried.
 * Every caller gets a bounded request so one slow provider cannot hold the
 * whole analysis route open.
 */
async function getJSON<T>(url: string, revalidate: number): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: UA, next: { revalidate }, signal: ctl.signal });
      if (!r.ok) {
        const retryable = r.status === 429 || r.status >= 500;
        const err = new Error(`upstream ${r.status}`);
        if (!retryable) throw Object.assign(err, { retryable: false });
        throw Object.assign(err, { retryable: true });
      }
      return await r.json();
    } catch (e) {
      lastError = e;
      const retryable = (e as { retryable?: boolean })?.retryable !== false;
      if (!retryable || attempt === 1) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("upstream request failed");
}

function unixOrNull(iso: string, offset: number): number | null {
  return toUnixSeconds(iso, offset);
}

export interface OpenMeteoWeather {
  current: {
    time: string;
    /** Unix seconds derived from the location-local timestamp + UTC offset. */
    timeUnix: number | null;
    temperature_2m: number;
    relative_humidity_2m: number;
    /** Raw provider amount for the preceding interval (mm / 15 min). */
    precipitation: number;
    /** Raw amount, explicitly named. Never label this as mm/h. */
    precipitationMM15: number | null;
    /** Converted rate (mm/h) for display and scoring. */
    precipitationRateMMH: number | null;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  hourly: {
    time: string[];
    timeUnix: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    pressure_msl: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
    soil_moisture_3_9cm: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
  };
  utc_offset_seconds: number;
}

export async function fetchWeather(lat: number, lon: number): Promise<OpenMeteoWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m",
    hourly:
      "precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,wind_speed_10m,soil_moisture_3_9cm",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
    past_days: "1",
  });
  const j = await getJSON<OpenMeteoWeather>(`https://api.open-meteo.com/v1/forecast?${params}`, 600);
  const offset = Number.isFinite(j.utc_offset_seconds) ? j.utc_offset_seconds : 0;
  const timeUnix = (j.hourly?.time ?? []).map((t) => unixOrNull(t, offset));
  const currentAmount = typeof j.current?.precipitation === "number" && Number.isFinite(j.current.precipitation)
    ? j.current.precipitation
    : null;
  return {
    ...j,
    current: {
      ...j.current,
      timeUnix: unixOrNull(j.current.time, offset),
      precipitationMM15: currentAmount,
      precipitationRateMMH: amountToRate(currentAmount, CURRENT_PRECIP_INTERVAL_MIN),
    },
    hourly: { ...j.hourly, timeUnix },
  };
}

export interface ModelSpec {
  id: string;
  label: string;
  resolution: string;
}

export const NWP_MODELS: ModelSpec[] = [
  { id: "ecmwf_ifs04", label: "ECMWF IFS", resolution: "Open IFS 0.4° (~45 km)" },
  { id: "gfs_seamless", label: "GFS", resolution: "NOAA seamless (~13–25 km)" },
  { id: "icon_seamless", label: "ICON", resolution: "DWD seamless (~13 km)" },
  { id: "gem_seamless", label: "GEM", resolution: "ECCC seamless (~15–25 km)" },
];

export interface ModelSeries {
  times: string[];
  /** Unix seconds for timezone-safe alignment across Vercel/UTC and IST. */
  timeUnix: (number | null)[];
  /** Null = provider omitted the value. Never pre-filled as zero. */
  values: (number | null)[];
}

export async function fetchModelPrecip(
  lat: number,
  lon: number,
  modelId: string
): Promise<ModelSeries> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "precipitation",
    models: modelId,
    timezone: "auto",
    forecast_days: "2",
  });
  type ModelPayload = {
    utc_offset_seconds?: number;
    hourly?: { precipitation?: unknown; time?: unknown };
  };
  const j = await getJSON<ModelPayload>(`https://api.open-meteo.com/v1/forecast?${params}`, 1800);
  const arr = j?.hourly?.precipitation;
  const times = j?.hourly?.time;
  if (!Array.isArray(arr) || !Array.isArray(times) || arr.length !== times.length) {
    throw new Error("unexpected model payload shape");
  }
  const offset = typeof j.utc_offset_seconds === "number" ? j.utc_offset_seconds : 0;
  const iso = times as string[];
  return {
    times: iso,
    timeUnix: iso.map((t) => unixOrNull(t, offset)),
    values: (arr as unknown[]).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null)),
  };
}

export interface RadarMeta {
  host: string;
  generated: number;
  past: { time: number; path: string }[];
  nowcast: { time: number; path: string }[];
}

export async function fetchRadar(): Promise<RadarMeta> {
  type RadarPayload = {
    host?: string;
    generated?: number;
    radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] };
  };
  const j = await getJSON<RadarPayload>("https://api.rainviewer.com/public/weather-maps.json", 300);
  if (!j?.host || !Array.isArray(j?.radar?.past)) throw new Error("bad radar payload");
  return { host: j.host, generated: j.generated ?? 0, past: j.radar.past, nowcast: j.radar.nowcast ?? [] };
}

export function radarTileUrl(host: string, path: string, z: number, x: number, y: number, size: 256 | 512 = 256): string {
  return `${host}${path}/${size}/{z}/{x}/{y}/2/1_1.png`;
}

/** Concrete radar tile URL (no Leaflet tokens) for snapshot <img> cards. */
export function radarTileSnapshot(host: string, path: string, z: number, x: number, y: number): string {
  return `${host}${path}/512/${z}/${x}/${y}/2/1_1.png`;
}

export function validCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function gibsDate(daysBack = 1): string {
  const d = new Date(Date.now() - daysBack * 864e5);
  return d.toISOString().slice(0, 10);
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const j = await getJSON<{ elevation?: unknown[] }>(
      `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`,
      86400
    );
    const e = j?.elevation?.[0];
    return typeof e === "number" ? e : null;
  } catch {
    return null;
  }
}
