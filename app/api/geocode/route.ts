import { NextResponse } from "next/server";

export const revalidate = 86400;
export const dynamic = "force-dynamic";

export interface GeoResult {
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Keyless Open-Meteo geocoding, validated + normalized server-side. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    return NextResponse.json({ status: "IDLE", results: [] });
  }
  try {
    const params = new URLSearchParams({ name: q, count: "8", language: "en", format: "json" });
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
      headers: { "User-Agent": "DRISHTI-X-PS26071 search" },
      next: { revalidate: 86400 },
    });
    if (!r.ok) throw new Error(`geocoder ${r.status}`);
    const j = await r.json();
    const results: GeoResult[] = Array.isArray(j?.results)
      ? j.results
          .filter(
            (x: unknown): x is Record<string, unknown> =>
              typeof x === "object" &&
              x !== null &&
              typeof (x as Record<string, unknown>).name === "string" &&
              Number.isFinite((x as Record<string, unknown>).latitude) &&
              Number.isFinite((x as Record<string, unknown>).longitude)
          )
          .map((x: Record<string, unknown>) => ({
            name: String(x.name),
            admin1: typeof x.admin1 === "string" ? x.admin1 : "",
            country: typeof x.country === "string" ? x.country : "",
            latitude: Math.max(-90, Math.min(90, Number(x.latitude))),
            longitude: Math.max(-180, Math.min(180, Number(x.longitude))),
            timezone: typeof x.timezone === "string" ? x.timezone : "auto",
          }))
          .slice(0, 8)
      : [];
    return NextResponse.json({ status: "LIVE", source: "Open-Meteo Geocoding (free, no key)", results });
  } catch (e) {
    return NextResponse.json(
      { status: "OFFLINE", source: "Open-Meteo Geocoding", results: [], error: String(e) },
      { status: 502 }
    );
  }
}
