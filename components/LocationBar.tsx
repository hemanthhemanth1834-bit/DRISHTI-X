"use client";
import { useState } from "react";
import { DEMO_LOCATIONS, type DemoLocation } from "@/lib/locations";

export default function LocationBar({
  current,
  customLabel,
  onAnalyze,
}: {
  current: DemoLocation;
  customLabel: string | null;
  onAnalyze: (lat: number, lon: number, label: string, preset: DemoLocation | null) => void;
}) {
  const [q, setQ] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [err, setErr] = useState("");

  const submitPreset = (d: DemoLocation) => {
    setErr("");
    onAnalyze(d.lat, d.lon, d.name, d);
  };

  const submitCustom = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
      setErr("Enter valid latitude (−90…90) and longitude (−180…180).");
      return;
    }
    setErr("");
    const label = q.trim() || `${la.toFixed(2)}, ${lo.toFixed(2)}`;
    onAnalyze(la, lo, label, null);
  };

  const searchCity = () => {
    const hit = DEMO_LOCATIONS.find((d) => d.name.toLowerCase() === q.trim().toLowerCase());
    if (hit) {
      submitPreset(hit);
    } else if (q.trim()) {
      setErr("City not in demo set — enter its coordinates to fetch real data.");
    }
  };

  return (
    <div className="panel locPanel" aria-label="Analyze location">
      <div className="metricLabel">Analyze location</div>
      <div className="locRow">
        <input
          className="locInput"
          aria-label="City name"
          placeholder="City — e.g. Vijayawada"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCity()}
        />
        <button className="btn primary locBtn" onClick={searchCity}>
          Analyze
        </button>
      </div>
      <div className="locRow">
        <input className="locInput" aria-label="Latitude" placeholder="Lat 16.51" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        <input className="locInput" aria-label="Longitude" placeholder="Lon 80.65" value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
        <button className="btn locBtn" onClick={submitCustom}>
          Go
        </button>
      </div>
      {err && (
        <p className="locErr" role="alert">
          {err}
        </p>
      )}
      <div className="metricLabel" style={{ marginTop: 12 }}>
        Demo locations — real data per coordinate
      </div>
      <div className="chipRow">
        {DEMO_LOCATIONS.map((d) => {
          const active = !customLabel && d.name === current.name;
          return (
            <button key={d.name} className={`chip${active ? " active" : ""}`} onClick={() => submitPreset(d)} aria-pressed={active}>
              {d.name}
            </button>
          );
        })}
      </div>
      {customLabel && <p className="locCustom">Custom point: {customLabel} — live Open-Meteo data.</p>}
    </div>
  );
}
