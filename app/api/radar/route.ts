import { NextResponse } from "next/server";
import { fetchRadar } from "@/lib/providers";

export const revalidate = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const meta = await fetchRadar();
    const fresh = Date.now() / 1000 - meta.generated < 7200;
    return NextResponse.json({
      status: meta.past.length > 0 && fresh ? "LIVE" : "DELAYED",
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
