"use client";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import type { RadarInfo } from "./ImageryCards";
import type { SatLayer } from "@/hooks/useDrishti";
import { formatNum, formatPrecip } from "@/lib/normalize";
import { StatusDot } from "./StatusBar";
import type { SourceStatus } from "@/lib/locations";

/**
 * Synchronized observation workspace: every stage reads the SAME live
 * analysis payload + provider states — no new fetches, no new APIs.
 * Satellite → Radar → Current conditions → NWP → AI → Inundation → Warning.
 */
export default function ObservationWorkspace({
  analysis,
  live,
  label,
  radar,
  satLayers,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
  radar: RadarInfo;
  satLayers: SatLayer[];
}) {
  const c = live ? analysis?.current : undefined;
  const risk = live ? analysis?.risk : undefined;
  const models = analysis?.models ?? [];
  const gibs = satLayers.find((l) => l.id === "viirs-truecolor");
  const lastFrame = radar.past.length ? radar.past[radar.past.length - 1] : null;

  const stages: { name: string; status: SourceStatus; lines: string[] }[] = [
    {
      name: "Satellite",
      status: gibs?.status ?? "OFFLINE",
      lines: gibs ? [`${gibs.satellite}`, `${gibs.date} · ${gibs.resolution}`] : ["NO CURRENT DATA"],
    },
    {
      name: "Radar",
      status: radar.status,
      lines:
        radar.status === "LIVE" && lastFrame
          ? [`${radar.past.length} past frames`, `frame ${new Date(lastFrame.time * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })} IST`]
          : ["RADAR DATA UNAVAILABLE"],
    },
    {
      name: "Current conditions",
      status: live ? "LIVE" : "OFFLINE",
      lines: c
        ? [`${formatNum(c.temperature, 1, "°C")} · rain ${formatNum(c.precipitationRateMMH, 1, " mm/h")}`, `RH ${formatNum(c.humidity, 0, "%")} · wind ${formatNum(c.windSpeed, 0, " km/h")} · model-derived`]
        : ["SOURCE UNAVAILABLE"],
    },
    {
      name: "NWP",
      status: (analysis?.provenance?.modelsLive ?? 0) > 0 ? "LIVE" : "OFFLINE",
      lines:
        models.length > 0
          ? [`${analysis?.provenance?.modelsLive ?? 0}/4 live · agree ${analysis?.agreement01 == null ? "—" : `${Math.round(analysis.agreement01 * 100)}%`}`, models.filter((m) => m.status === "LIVE").map((m) => `${m.label} ${m.precipMM == null ? "—" : `${m.precipMM.toFixed(1)}mm`}`).join(" · ") || "no live totals"]
          : ["SOURCE UNAVAILABLE"],
    },
    {
      name: "AI rainfall",
      status: risk ? "READY" : "OFFLINE",
      lines: risk ? [`${risk.score}/100 ${risk.level}`, `driver: ${risk.drivers[0] ?? "—"}`] : ["awaiting inputs"],
    },
    {
      name: "Inundation",
      status: risk ? "READY" : "OFFLINE",
      lines: risk ? [`${risk.inundation.riskIndex}/100 ${risk.inundation.class} · coverage ${Math.round(risk.inundation.coverage01 * 100)}%`, "UNCALIBRATED MODEL ESTIMATE — not observed"] : ["awaiting inputs"],
    },
    {
      name: "Warning",
      status: risk ? "READY" : "OFFLINE",
      lines: risk ? [`${risk.level} (DRISHTI-X threshold)`, `${label}`] : ["unavailable"],
    },
  ];

  return (
    <div className="panel wsPanel" aria-label="Synchronized observation workspace">
      <div className="metricLabel">Evidence chain — one location, one analysis: {label}</div>
      <ol className="wsChain">
        {stages.map((s, i) => (
          <li key={s.name}>
            <span className="wsHead"><StatusDot status={s.status} /> {s.name}</span>
            {s.lines.map((l) => (
              <span key={l} className="wsLine">{l}</span>
            ))}
            {i < stages.length - 1 && <span className="wsArrow" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <p className="prov">All stages share the same {label} analysis ({formatPrecip(analysis?.accum?.h24)} / 24h; — means incomplete, never zero). Current conditions are model-derived, not ground observations. Provider model values ≠ this app&apos;s estimates.</p>
    </div>
  );
}
