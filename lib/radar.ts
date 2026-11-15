/**
 * Radar freshness contract: LIVE is shown only when the newest available
 * frame is younger than the staleness threshold. Older frames → DELAYED.
 * No frames → OFFLINE. Never fabricate recency.
 */

export const RADAR_STALE_MIN = 120;
export const RADAR_FRAME_MS = 10 * 60e3;
/**
 * Verified live against tilecache.rainviewer.com: 512px radar tiles return
 * real content at levels 0–7; level 8+ returns a static "Zoom Level Not
 * Supported" error tile (byte-identical across coordinates). Radar
 * TileLayers must set maxNativeZoom to this so Leaflet upscales instead of
 * requesting unsupported levels. Basemaps keep their own (higher) limits.
 */
export const RADAR_MAX_NATIVE_ZOOM = 7;

export type RadarDisplayStatus = "LIVE" | "DELAYED" | "OFFLINE";

export function radarFrameAgeMin(timeSec: number, nowMs = Date.now()): number {
  return Math.max(0, Math.round((nowMs - timeSec * 1000) / 60000));
}

/** Client-side display status derived from actual frame timestamps. */
export function radarDisplayStatus(hasFrames: boolean, latestAgeMin: number | null): RadarDisplayStatus {
  if (!hasFrames || latestAgeMin == null) return "OFFLINE";
  return latestAgeMin <= RADAR_STALE_MIN ? "LIVE" : "DELAYED";
}

export function radarAgeLabel(ageMin: number | null): string {
  if (ageMin == null) return "age unknown";
  if (ageMin < 1) return "UPDATED <1 min ago";
  if (ageMin < 60) return `UPDATED ${ageMin} min ago`;
  return `UPDATED ${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`;
}

export interface RadarHealth {
  status: RadarDisplayStatus;
  latestAgeMin: number | null;
  latestFrameTime: number | null;
}

/**
 * Server-side radar readiness derived from the newest actual frame, not from
 * the payload's generation clock. Analysis uses this instead of a hardcoded
 * READY value; an unavailable feed is reported OFFLINE.
 */
export function radarHealth(
  meta: { past?: { time: number }[]; nowcast?: { time: number }[] } | null,
  nowMs = Date.now()
): RadarHealth {
  if (!meta) return { status: "OFFLINE", latestAgeMin: null, latestFrameTime: null };
  const frames = [...(meta.past ?? []), ...(meta.nowcast ?? [])].map((f) => f.time).filter((t) => Number.isFinite(t));
  if (frames.length === 0) return { status: "OFFLINE", latestAgeMin: null, latestFrameTime: null };
  const latest = Math.max(...frames);
  const latestAgeMin = radarFrameAgeMin(latest, nowMs);
  return { status: radarDisplayStatus(true, latestAgeMin), latestAgeMin, latestFrameTime: latest };
}
