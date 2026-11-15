"use client";
import { useEffect, useState } from "react";
import { Radar } from "lucide-react";
import { DEMO_LOCATIONS, type DemoLocation } from "@/lib/locations";
import type { SourceStatus } from "@/lib/locations";
import { StatusDot } from "./StatusBar";
import CitySearch from "./CitySearch";

function useClock() {
  // Hydration-safe: SSR and first client render emit the deterministic
  // placeholder; live time starts only after mount (client-only effect).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function ShellHeader({
  loc,
  customLabel,
  onSelect,
  onSearchPick,
  systemLive,
}: {
  loc: DemoLocation;
  customLabel: string | null;
  onSelect: (d: DemoLocation) => void;
  onSearchPick: (lat: number, lon: number, label: string) => void;
  systemLive: { label: string; status: SourceStatus }[];
}) {
  const now = useClock();
  const date = now
    ? now
        .toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })
        .toUpperCase()
    : "— — —";
  const time = now
    ? now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) +
      " IST"
    : "--:--:-- IST";
  const liveCount = systemLive.filter((s) => s.status === "LIVE" || s.status === "RECENT").length;

  return (
    <header className="shHeader" aria-label="Command center header">
      <div className="shBrand">
        <div className="brandmark"><Radar size={19} /></div>
        <div>
          <b>DRISHTI-X</b>
          <span>AI COMMAND CENTER</span>
          <em>AI/ML HEAVY RAINFALL &amp; INUNDATION INTELLIGENCE</em>
        </div>
      </div>
      <label className="shLoc">
        <span>INDIA ▼</span>
        <CitySearch onPick={onSearchPick} />
        <select
          value={customLabel ?? loc.name}
          onChange={(e) => {
            const d = DEMO_LOCATIONS.find((x) => x.name === e.target.value);
            if (d) onSelect(d);
          }}
          aria-label="Select monitored location in India"
        >
          {customLabel && <option value={customLabel}>{customLabel} (custom)</option>}
          {DEMO_LOCATIONS.map((d) => (
            <option key={d.name} value={d.name}>
              {d.name} — {d.state}
            </option>
          ))}
        </select>
      </label>
      <div className="shRight">
        <div className="shLive">
          <span><StatusDot status={liveCount > 0 ? "LIVE" : "OFFLINE"} /> LIVE DATA</span>
          <b>{date}</b>
          <b>{time}</b>
        </div>
        <div className="shSys" role="status">
          {systemLive.slice(0, 4).map((s) => (
            <span key={s.label}><StatusDot status={s.status} /> {s.label}</span>
          ))}
        </div>
      </div>
    </header>
  );
}
