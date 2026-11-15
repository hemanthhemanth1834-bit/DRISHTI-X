import { NextResponse } from "next/server";
import { fetchWeather, validCoords } from "@/lib/providers";

export const revalidate = 600;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat") ?? "16.5062");
  const lon = Number(searchParams.get("lon") ?? "80.648");
  if (!validCoords(lat, lon)) {
    return NextResponse.json({ status: "OFFLINE", error: "invalid coordinates: expected lat −90…90, lon −180…180" }, { status: 400 });
  }
  try {
    const data = await fetchWeather(lat, lon);
    return NextResponse.json({
      status: "LIVE",
      source: "Open-Meteo forecast API (free, no key)",
      fetchedAt: new Date().toISOString(),
      data,
    });
  } catch (e) {
    return NextResponse.json(
      { status: "OFFLINE", source: "Open-Meteo", fetchedAt: new Date().toISOString(), error: String(e) },
      { status: 502 }
    );
  }
}
