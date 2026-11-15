import { NextResponse } from "next/server";

export const revalidate = 60;
export const dynamic = "force-dynamic";

async function probe(url: string, ms: number): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal, method: "GET" });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const [meteo, rainviewer, gibs] = await Promise.all([
    probe("https://api.open-meteo.com/v1/forecast?latitude=16.5&longitude=80.6&current=temperature_2m&forecast_days=1", 8000),
    probe("https://api.rainviewer.com/public/weather-maps.json", 8000),
    probe("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml", 8000),
  ]);
  const sources = [
    { id: "openmeteo", name: "Open-Meteo", kind: "Weather + NWP", status: meteo ? "LIVE" : "OFFLINE" },
    { id: "rainviewer", name: "RainViewer", kind: "Radar tiles", status: rainviewer ? "LIVE" : "OFFLINE" },
    { id: "gibs", name: "NASA GIBS", kind: "Satellite imagery", status: gibs ? "RECENT" : "OFFLINE" },
    {
      id: "mosdac",
      name: "MOSDAC / ISRO",
      kind: "Indian satellite adapter",
      status: process.env.MOSDAC_USERNAME ? "READY" : "AUTH",
    },
    { id: "ai", name: "AI Engine", kind: "Transparent prototype", status: "READY" },
  ];
  return NextResponse.json({ fetchedAt: new Date().toISOString(), sources });
}
