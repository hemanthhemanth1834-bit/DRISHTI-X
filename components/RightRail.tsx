"use client";
import { useMemo } from "react";
import { fillGibs, tileXYZ } from "@/lib/imageSources";
import type { AnalysisPayload } from "@/hooks/useDrishti";
import { formatNum, formatPrecip } from "@/lib/normalize";
import { StatusBadge } from "./StatusBar";
import WarningCard from "./WarningCard";

function MiniBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="miniBars" aria-hidden>
      {values.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(4, (v / max) * 100)}%` }} title={`${v.toFixed(1)} mm/h`} />
      ))}
    </div>
  );
}

export default function RightRail({
  analysis,
  live,
  label,
  lat,
  lon,
  satLayers,
  onOpenSatellite,
}: {
  analysis: AnalysisPayload | null;
  live: boolean;
  label: string;
  lat: number;
  lon: number;
  satLayers: { id: string; template?: string; date?: string; status: string; product?: string; resolution?: string }[];
  onOpenSatellite: () => void;
}) {
  const risk = live ? analysis?.risk : undefined;
  const day = analysis?.daily;
  const bars = useMemo(() => (analysis?.hourly?.precipitation ?? []).filter((v): v is number => typeof v === "number").slice(0, 24), [analysis]);
  const gibs = satLayers.find((l) => l.id === "viirs-truecolor" && l.template);
  const { x, y } = tileXYZ(lat, lon, 5);
  const thumb = gibs?.template ? fillGibs(gibs.template, 5, x, y) : "";
  const days = ["TODAY", "TOMORROW", "NEXT DAY"];

  return (
    <aside className="shRight" aria-label="Live intelligence">
      <WarningCard label={label} accum={analysis?.accum} risk={risk} live={live} validUntil={analysis?.warning?.validUntil} />

      <div className="panel rCard">
        <div className="metricLabel">Current weather — Open-Meteo live</div>
        {live && analysis?.current ? (
          <div className="rBig">{formatNum(analysis.current.temperature, 0, "°C")}</div>
        ) : (
          <p className="unavail">SOURCE UNAVAILABLE</p>
        )}
        <div className="rFacts">
          <span>Rain {live ? formatNum(analysis?.current?.precipitation, 1, " mm/h") : "—"}</span>
          <span>Humidity {live ? formatNum(analysis?.current?.humidity, 0, "%") : "—"}</span>
          <span>Wind {live ? formatNum(analysis?.current?.windSpeed, 0, " km/h") : "—"}</span>
        </div>
      </div>

      <div className="panel rCard">
        <div className="metricLabel">Rainfall — last 24h (calculated)</div>
        <div className="rBig">{live ? formatPrecip(analysis?.accum?.h24) : "—"}</div>
        <div className="rFacts"><span>Peak {live ? formatPrecip(Math.max(0, ...bars)) + "/h" : "—"}</span><span>{label}</span></div>
        {bars.length > 0 && <MiniBars values={bars} />}
      </div>

      <div className="panel rCard">
        <div className="metricLabel">Inundation risk — AI-assisted model estimate</div>
        <div className="rBig rClass">{risk ? risk.inundation.class : "—"}</div>
        <div className="rFacts">
          <span>{risk ? `${Math.round(risk.inundation.prob01 * 100)}% probability` : "no inputs"}</span>
          <span>Horizon {(analysis?.accum ? "48h" : "—")}</span>
        </div>
      </div>

      <div className="panel rCard">
        <div className="metricLabel">Satellite imagery</div>
        {thumb ? (
          <button className="rThumb" onClick={onOpenSatellite} aria-label="Open full satellite viewer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt={`NASA satellite cloud imagery over ${label}, India`} loading="lazy" decoding="async" />
          </button>
        ) : (
          <p className="unavail">NO CURRENT DATA</p>
        )}
        <div className="rFacts"><span>NASA GIBS · {gibs?.date ?? "—"}</span>{gibs && <StatusBadge status={gibs.status as "RECENT"} />}</div>
      </div>

      <div className="panel rCard">
        <div className="metricLabel">Forecast — Open-Meteo daily</div>
        {day && day.time.length > 0 ? (
          <div className="fcRow">
            {days.map((d, i) => (
              <div key={d}>
                <span>{d}</span>
                <b>{formatNum(day.tmax?.[i], 0, "°")}</b>
                <span>rain {formatPrecip(day.psum?.[i])}</span>
                <span>p {day.pprob?.[i] == null ? "—" : `${Math.round(day.pprob[i] as number)}%`}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="unavail">SOURCE UNAVAILABLE</p>
        )}
      </div>
    </aside>
  );
}
