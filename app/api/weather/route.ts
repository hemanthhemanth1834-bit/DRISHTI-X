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
    // API contract: `time` is UTC ISO. Keep the raw wall-clock value separately
    // so provider-native local time remains inspectable without being mistaken
    // for an instant.
    const current = {
      ...data.current,
      timeLocal: data.current.time,
      time: data.current.timeUnix == null ? data.current.time : new Date(data.current.timeUnix * 1000).toISOString(),
    };
    const hourly = {
      ...data.hourly,
      timeLocal: data.hourly.time,
      time: data.hourly.time.map((t, i) => {
        const u = data.hourly.timeUnix[i];
        return u == null ? t : new Date(u * 1000).toISOString();
      }),
    };
    return NextResponse.json({
      status: "LIVE",
      source: "Open-Meteo forecast API (free, no key)",
      fetchedAt: new Date().toISOString(),
      provenance: {
        note: "Model-derived current conditions, not a ground observation.",
        time: data.current?.timeUnix == null ? null : new Date(data.current.timeUnix * 1000).toISOString(),
      },
      units: {
        currentPrecipitation: "mm per 15-minute interval",
        precipitationRateMMH: "mm/h (converted from the 15-minute amount)",
        hourlyPrecipitation: "mm per hour",
      },
      data: { ...data, current, hourly },
    });
  } catch (e) {
    return NextResponse.json(
      { status: "OFFLINE", source: "Open-Meteo", fetchedAt: new Date().toISOString(), error: String(e) },
      { status: 502 }
    );
  }
}
