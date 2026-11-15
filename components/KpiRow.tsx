"use client";
import type { ReactNode } from "react";

export type KpiTone = "ok" | "watch" | "alert" | "severe" | "extreme" | "info" | "muted";

export interface Kpi {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  badge?: string;
  tone?: KpiTone;
  sub?: string;
}

export default function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <div className="kpiRow" role="group" aria-label="Key indicators">
      {items.map((k) => (
        <div className="kpiCard" key={k.label}>
          <span className={`kpiIcon t-${k.tone ?? "info"}`} aria-hidden>{k.icon}</span>
          <div className="kpiBody">
            <span className="kpiLabel">{k.label}</span>
            <span className="kpiVal">
              {k.value}
              {k.unit && <em>{k.unit}</em>}
            </span>
            {(k.badge || k.sub) && (
              <span className="kpiFoot">
                {k.badge && <b className={`kpiBadge t-${k.tone ?? "info"}`}>{k.badge}</b>}
                {k.sub && <span className="kpiSub">{k.sub}</span>}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
