import { NextResponse } from "next/server";
import { NWP_MODELS, fetchModelPrecip, validCoords, type ModelSeries } from "@/lib/providers";
import { agreementOf, consensusConfidence, spreadOf } from "@/lib/engine";

export const revalidate = 1800;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat") ?? "16.5062");
  const lon = Number(searchParams.get("lon") ?? "80.648");
  if (!validCoords(lat, lon)) {
    return NextResponse.json({ status: "OFFLINE", error: "invalid coordinates: expected lat −90…90, lon −180…180" }, { status: 400 });
  }
  const settled = await Promise.allSettled(NWP_MODELS.map((m) => fetchModelPrecip(lat, lon, m.id)));
  const ok = settled
    .map((r, i) => ({ r, spec: NWP_MODELS[i] }))
    .filter((x): x is { r: PromiseFulfilledResult<ModelSeries>; spec: (typeof NWP_MODELS)[number] } => x.r.status === "fulfilled");
  // Equivalent window = future-anchored intersection across live model grids
  // (identical timestamps for every model, never zero-filled; ≥12h required).
  const horizon = Date.now() - 30 * 60e3;
  const future = (ts: string[]) => ts.filter((t) => new Date(t).getTime() > horizon);
  const overlap = ok.length
    ? future(ok[0].r.value.times).filter((t) => ok.every((x) => x.r.value.times.includes(t))).slice(0, 48)
    : [];
  const usable = overlap.length >= 12 ? overlap : [];
  const models = NWP_MODELS.map((m, i) => {
    const s = settled[i];
    if (s.status !== "fulfilled" || usable.length === 0) {
      return { model: m.id, label: m.label, resolution: m.resolution, windowH: 0, precipMM: 0, precipMM48: 0, maxIntensityMMH: 0, status: "OFFLINE" as const, windowNote: usable.length === 0 ? "no common future window" : "fetch failed" };
    }
    const idx = new Map(s.value.times.map((t, k) => [t, k] as [string, number]));
    const raw = usable.map((t) => s.value.values[idx.get(t) ?? -1] ?? null);
    const vals = raw.filter((v): v is number => typeof v === "number");
    if (vals.length === 0) {
      return { model: m.id, label: m.label, resolution: m.resolution, windowH: 0, precipMM: 0, precipMM48: 0, maxIntensityMMH: 0, status: "OFFLINE" as const, windowNote: "no usable values" };
    }
    const v48 = s.value.values.slice(0, 48).filter((v): v is number => typeof v === "number");
    return {
      model: m.id,
      label: m.label,
      resolution: m.resolution,
      windowH: usable.length,
      windowStart: usable[0] ?? null,
      precipMM: Math.round(vals.slice(0, 24).reduce((a, x) => a + x, 0) * 10) / 10,
      precipMM48: Math.round(v48.reduce((a, x) => a + x, 0) * 10) / 10,
      maxIntensityMMH: Math.round(Math.max(...vals) * 10) / 10,
      status: "LIVE" as const,
    };
  });
  const liveTotals = models.filter((m) => m.status === "LIVE").map((m) => m.precipMM);
  const agreement01 = Math.round(agreementOf(liveTotals) * 100) / 100;
  const spreadMM = spreadOf(liveTotals);
  const mean = liveTotals.length ? liveTotals.reduce((s, v) => s + v, 0) / liveTotals.length : 0;
  return NextResponse.json({
    status: liveTotals.length > 0 ? "LIVE" : "OFFLINE",
    source: "Open-Meteo multi-model (ECMWF IFS / GFS / ICON / GEM), units mm, aligned on common timestamps",
    fetchedAt: new Date().toISOString(),
    runNote: "Open-Meteo does not publish per-model run/init timestamps; windows are aligned on common forecast timestamps.",
    modelsAvailable: `${liveTotals.length}/${NWP_MODELS.length}`,
    agreement01,
    spreadMM,
    consensus: consensusConfidence(liveTotals.length, spreadMM, mean),
    models,
  });
}
