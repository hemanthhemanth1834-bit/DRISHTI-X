import { NextResponse } from "next/server";
import { gibsTemplate } from "@/lib/imageSources";
import { GIBS_LAYERS } from "@/lib/imageSources";
import { gibsDate } from "@/lib/providers";

export const revalidate = 3600;
export const dynamic = "force-dynamic";

/**
 * Satellite imagery registry response. RainViewer satellite-IR is
 * intentionally NOT offered: the provider discontinued that service
 * in 2026, so the app must not try to revive it.
 */
export async function GET() {
  const date = gibsDate(1);
  const hasMosdac = Boolean(process.env.MOSDAC_USERNAME);
  return NextResponse.json({
    status: "RECENT",
    fetchedAt: new Date().toISOString(),
    note: "GIBS imagery is daily (date shown per layer); radar stays on the command map and radar card.",
    layers: [
      ...GIBS_LAYERS.map((l) => ({
        id: l.id,
        satellite: l.satellite,
        product: l.product,
        date,
        coverage: "Global (India view default)",
        resolution: l.resolution,
        status: "RECENT",
        template: gibsTemplate(l.gibsLayer, date, l.format),
      })),
      {
        id: "mosdac",
        satellite: "MOSDAC / ISRO",
        product: "Indian satellite adapter (optional credentials)",
        date: "—",
        coverage: "India",
        resolution: "product-dependent",
        status: hasMosdac ? "READY" : "AUTH",
        note: hasMosdac
          ? "Credentials present; adapter path ready."
          : "AUTH REQUIRED — adapter path only, no imagery fabricated. See .env.example.",
      },
    ],
  });
}
