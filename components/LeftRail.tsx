"use client";
import { Bell, BookOpen, BrainCircuit, CloudRain, Database, FileText, LayoutDashboard, Map, Satellite, Waves } from "lucide-react";

export type ShellView =
  | "overview"
  | "gis"
  | "rainfall"
  | "inundation"
  | "alerts"
  | "models"
  | "data"
  | "training"
  | "satellite"
  | "reports";

const GROUPS: { title: string; items: { id: ShellView; label: string; icon: typeof Map }[] }[] = [
  {
    title: "Monitoring",
    items: [
      { id: "overview", label: "COMMAND CENTER", icon: LayoutDashboard },
      { id: "gis", label: "GIS MAP", icon: Map },
      { id: "rainfall", label: "RAINFALL FORECAST", icon: CloudRain },
      { id: "inundation", label: "INUNDATION ANALYSIS", icon: Waves },
      { id: "alerts", label: "WARNINGS & ALERTS", icon: Bell },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { id: "models", label: "MODEL INSIGHTS", icon: BrainCircuit },
      { id: "data", label: "DATA SOURCES", icon: Database },
      { id: "training", label: "TRAINING & DOCS", icon: BookOpen },
    ],
  },
  {
    title: "Imagery & Reporting",
    items: [
      { id: "satellite", label: "SATELLITE & RADAR", icon: Satellite },
      { id: "reports", label: "REPORTS", icon: FileText },
    ],
  },
];

export default function LeftRail({ view, onView }: { view: ShellView; onView: (v: ShellView) => void }) {
  return (
    <nav className="shRail" aria-label="Command center sections">
      {GROUPS.map((g) => (
        <div className="railGroup" key={g.title}>
          <span className="railGroupTitle">{g.title}</span>
          {g.items.map((it) => {
            const Icon = it.icon;
            const active = it.id === view;
            return (
              <button
                key={it.id}
                type="button"
                className={`railBtn${active ? " active" : ""}`}
                onClick={() => onView(it.id)}
                aria-current={active ? "page" : undefined}
                aria-label={it.label}
                title={it.label}
              >
                <Icon size={18} />
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
