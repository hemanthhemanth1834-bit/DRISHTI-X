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
  // Equivalent window = future-anchored intersection by Unix second, never by
  // offset-less local strings. ≥12h required; otherwise no comparable window.
  const horizon = Date.now() / 1000 - 30 * 60;
  const future = (s: ModelSeries) =>
    s.timeUnix
      .map((t, i) => ({ t, v: s.values[i] ?? null }))
      .filter((row): row is { t: number; v: number | null } => typeof row.t === "number" && row.t > horizon)
      .map((row) => row.t);
  const overlap = ok.length
    ? future(ok[0].r.value).filter((t) => ok.every((x) => x.r.value.timeUnix.includes(t))).slice(0, 48)
    : [];
  const usable = overlap.length >= 12 ? overlap : [];
  const models = NWP_MODELS.map((m, i) => {
    const s = settled[i];
    if (s.status !== "fulfilled" || usable.length === 0) {
      return {
        model: m.id, label: m.label, resolution: m.resolution,
        windowH: 0, windowStart: null, precipMM: null, precipMM48: null,
        maxIntensityMMH: null, status: "OFFLINE" as const,
        windowNote: usable.length === 0 ? "no common future window" : "fetch failed",
      };
    }
    const idx = new Map<number, number>();
    s.value.timeUnix.forEach((t, k) => { if (typeof t === "number") idx.set(t, k); });
    const raw: (number | null)[] = usable.map((t) => {
      const k = idx.get(t);
      return k == null ? null : s.value.values[k] ?? null;
    });
    const vals24 = raw.slice(0, 24);
    const complete24 = vals24.length === 24 && vals24.every((v): v is number => typeof v === "number");
    const complete48 = raw.length === 48 && raw.every((v): v is number => typeof v === "number");
    const finite = raw.filter((v): v is number => typeof v === "number");
    if (finite.length === 0) {
      return {
        model: m.id, label: m.label, resolution: m.resolution,
        windowH: 0, windowStart: null, precipMM: null, precipMM48: null,
        maxIntensityMMH: null, status: "OFFLINE" as const,
        windowNote: "no usable values",
      };
    }
    return {
      model: m.id,
      label: m.label,
      resolution: m.resolution,
      windowH: usable.length,
      windowStart: usable[0] ? new Date(usable[0] * 1000).toISOString() : null,
      precipMM: complete24 ? Math.round((vals24 as number[]).reduce((a, x) => a + x, 0) * 10) / 10 : null,
      precipMM48: complete48 ? Math.round((raw as number[]).reduce((a, x) => a + x, 0) * 10) / 10 : null,
      maxIntensityMMH: Math.round(Math.max(...finite) * 10) / 10,
      status: "LIVE" as const,
    };
  });
  const liveTotals = models
    .filter((m) => m.status === "LIVE" && typeof m.precipMM === "number")
    .map((m) => m.precipMM as number);
  const agreement01 = liveTotals.length >= 2 ? Math.round(agreementOf(liveTotals) * 100) / 100 : null;
  const spreadMM = liveTotals.length >= 2 ? spreadOf(liveTotals) : null;
  const mean = liveTotals.length ? Math.round((liveTotals.reduce((s, v) => s + v, 0) / liveTotals.length) * 10) / 10 : null;
  return NextResponse.json({
    status: liveTotals.length > 0 ? "LIVE" : "OFFLINE",
    source: "Open-Meteo multi-model (ECMWF IFS / GFS / ICON / GEM), units mm, aligned on common Unix timestamps",
    fetchedAt: new Date().toISOString(),
    runNote: "Open-Meteo does not publish per-model run/init timestamps; windows are aligned on common forecast Unix timestamps.",
    modelsAvailable: `${liveTotals.length}/${NWP_MODELS.length}`,
    agreement01,
    spreadMM,
    consensus: consensusConfidence(liveTotals.length, spreadMM ?? 0, mean ?? 0),
    mean24: mean,
    models,
  });
}
