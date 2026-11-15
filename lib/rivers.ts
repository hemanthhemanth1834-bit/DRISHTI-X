/**
 * Free river/drainage context via OpenStreetMap Overpass API (no key).
 * Small bounded query, short timeout, callers cache aggressively and treat
 * failure as OFFLINE. Names come from OSM tags; distances are haversine
 * estimates to the feature center — context, not hydrology.
 */

export interface RiverInfo {
  name: string;
  kind: string;
  distKm: number;
}

export interface RiverResult {
  status: "READY" | "OFFLINE";
  rivers: RiverInfo[];
  note: string;
}

function havKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export async function fetchRivers(lat: number, lon: number): Promise<RiverResult> {
  const d = 0.3;
  const ql = `[out:json][timeout:8];(way["waterway"~"^(river|stream|canal)$"](${lat - d},${lon - d},${lat + d},${lon + d}););out center tags 8;`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "DRISHTI-X-PS26071 research" },
      body: "data=" + encodeURIComponent(ql),
      signal: ctl.signal,
      next: { revalidate: 86400 },
    });
    clearTimeout(t);
    if (!r.ok) throw new Error(`overpass ${r.status}`);
    const j = await r.json();
    const els = Array.isArray(j?.elements) ? j.elements : [];
    const rivers: RiverInfo[] = els
      .filter((e: unknown) => typeof e === "object" && e !== null && (e as { center?: unknown }).center)
      .map((e: unknown) => {
        const el = e as { center: { lat: number; lon: number }; tags?: Record<string, string> };
        return {
          name: el.tags?.name ?? "unnamed waterway",
          kind: el.tags?.waterway ?? "waterway",
          distKm: Math.round(havKm(lat, lon, el.center.lat, el.center.lon) * 10) / 10,
        };
      })
      .filter((x: RiverInfo) => Number.isFinite(x.distKm))
      .sort((a: RiverInfo, b: RiverInfo) => a.distKm - b.distKm)
      .slice(0, 5);
    return {
      status: "READY",
      rivers,
      note: rivers.length
        ? `${rivers.length} OSM-mapped waterways within ~33 km; nearest ${rivers[0].distKm} km. Context only — not a drainage model.`
        : "No OSM-mapped rivers within ~33 km.",
    };
  } catch {
    return { status: "OFFLINE", rivers: [], note: "River lookup offline (Overpass unreachable)." };
  }
}
