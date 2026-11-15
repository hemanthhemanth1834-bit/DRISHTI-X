import { NextResponse } from "next/server";
import { fetchRadar } from "@/lib/providers";
import { radarHealth } from "@/lib/radar";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const meta = await fetchRadar();
    const health = radarHealth(meta);
    return NextResponse.json({
      status: health.status,
      latestAgeMin: health.latestAgeMin,
      source: "RainViewer public radar API (free, no key)",
      fetchedAt: new Date().toISOString(),
      ...meta,
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "OFFLINE",
        source: "RainViewer",
        fetchedAt: new Date().toISOString(),
        host: "",
        generated: 0,
        past: [],
        nowcast: [],
        error: String(e),
      },
      { status: 502 }
    );
  }
}
