"use client";
import type { ModelRain } from "@/hooks/useDrishti";
import { StatusBadge } from "./StatusBar";

function m1(v: unknown, suffix = " mm"): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : "—";
}

export default function NwpPanel({
  models,
  agreement01,
  spreadMM,
  consensus,
  locationLabel,
  windowNote,
  onRefresh,
}: {
  models?: ModelRain[];
  agreement01?: number;
  spreadMM?: number;
  consensus?: "LOW" | "MODERATE" | "HIGH";
  locationLabel?: string;
  windowNote?: string;
  onRefresh?: () => void;
}) {
  const live = (models ?? []).filter((m) => m.status === "LIVE");
  if (!models || models.length === 0 || live.length === 0) {
    return (
      <div className="panel model">
        <div className="metricLabel">NWP model consensus</div>
        <p className="unavail">NWP DATA UNAVAILABLE — no model returned a valid dataset.</p>
      </div>
    );
  }
  // Bar scale = maximum valid live total (real relative lengths; all-dry
  // models legitimately render near-empty bars).
  const maxV = Math.max(0.5, ...live.map((m) => m.precipMM ?? 0));
  const pct = Math.round((agreement01 ?? 0) * 100);
  const spreadText =
    live.length < 1 ? "UNAVAILABLE" : live.length < 2 ? "N/A — INSUFFICIENT MODEL AGREEMENT DATA (1 model)" : `${(spreadMM ?? 0).toFixed(1)} mm`;
  return (
    <div className="panel model">
      <div className="metricLabel" title="NWP Model Consensus compares precipitation forecasts from independently available numerical weather prediction models over the same forecast window and selected location. It is a computed comparison, not an official IMD warning and not an official probabilistic confidence product.">
        NWP model consensus — live Open-Meteo runs (mm, identical-window comparison) ⓘ
        {onRefresh && <button className="tab" onClick={onRefresh} aria-label="Refresh NWP data" style={{ marginLeft: 8 }}>↻</button>}
      </div>
      {models.map((m) => {
        const ok = m.status === "LIVE" && m.precipMM != null;
        return (
          <div
            className="modelRow"
            key={m.model}
            title={`${m.label} — Location: ${locationLabel ?? "—"} | ${windowNote ?? ""} | Forecast precipitation: ${ok ? `${(m.precipMM as number).toFixed(1)} mm` : "unavailable"} | Provider: Open-Meteo | Status: ${m.status}`}
          >
            <span>
              {m.label}
              <StatusBadge status={m.dataMissing ? "OFFLINE" : m.status} />
              {m.dataMissing && <em className="dataFlag">UNAVAILABLE</em>}
            </span>
            <div className="bar">
              <span style={{ width: ok ? `${Math.min(100, ((m.precipMM as number) / maxV) * 100)}%` : "0%" }} />
            </div>
            <b>{ok ? `${(m.precipMM as number).toFixed(1)} mm` : "—"}</b>
          </div>
        );
      })}
      <div className="agree">
        <div className="agreeHead">
          <span>MODEL AGREEMENT = 1 − SPREAD / MAX(MEAN, 2MM)</span>
          <b>{live.length < 2 ? "—" : `${pct}%`}</b>
        </div>
        <div className="agreeBar">
          <span style={{ width: live.length < 2 ? "0%" : `${pct}%` }} />
        </div>
        <dl className="nwpFacts">
          <div><dt>Models available</dt><dd>{live.length}/{models.length}</dd></div>
          <div><dt>Spread (max−min)</dt><dd>{spreadText}</dd></div>
          <div><dt>Consensus</dt><dd>{live.length < 2 ? "—" : `${consensus ?? "—"} (statistical, not AI confidence)`}</dd></div>
        </dl>
        <p className="prov">
          {live.map((m) => `${m.label} ${m.resolution}`).join(" · ") || "No live models — agreement not computed"}
        </p>
        <p className="prov">Model run/init timestamps are not published by the provider; windows are aligned on common forecast timestamps instead. Model identity follows the provider&apos;s documented `models` request contract (responses carry no model echo).</p>
      </div>
    </div>
  );
}
