"use client";
import { useMemo, useState } from "react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { IST } from "@/lib/format";

const WINDOWS = [1, 3, 6, 12, 24, 48] as const;

/** Deterministic pseudo-random from index (SSR-safe: no Math.random in render). */
function prand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function CrystalTip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="crystalTip" role="status">
      <b>{label}</b>
      <span>{Number(payload[0].value).toFixed(1)} mm/h</span>
    </div>
  );
}

export default function RainChart({ hourly, gaps, onRefresh }: { hourly?: { time: string[]; precipitation: (number | null)[] }; gaps?: number; onRefresh?: () => void }) {
  const [win, setWin] = useState<number>(24);
  const rows = useMemo(() => {
    if (!hourly) return [];
    return hourly.time.map((t, i) => {
      const v = hourly.precipitation[i];
      return {
        t: new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", day: "2-digit", month: "short", timeZone: IST }),
        // Null = provider gap: rendered as a visible break, never zero-filled.
        v: typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null,
      };
    });
  }, [hourly]);
  const total = useMemo(
    () => Math.round(rows.slice(0, win).reduce((s, r) => s + (r.v ?? 0), 0) * 10) / 10,
    [rows, win]
  );
  const shown = useMemo(() => rows.slice(0, Math.max(win, 12)), [rows, win]);
  const peakIdx = useMemo(() => {
    let bi = 0;
    shown.forEach((r, i) => {
      if ((r.v ?? -1) > (shown[bi].v ?? -1)) bi = i;
    });
    return bi;
  }, [shown]);
  const peakV = shown[peakIdx]?.v ?? null;
  // Intensity class from real peak (drives glow strength, not data).
  const intensity = (peakV ?? 0) >= 10 ? "heavy" : (peakV ?? 0) >= 2.5 ? "mod" : "low";
  // Sparse deterministic particles scaled by real intensity (SSR-safe).
  const motes = useMemo(() => {
    const pv = peakV ?? 0;
    const n = pv <= 0.2 ? 0 : Math.min(14, 4 + Math.round(pv));
    return Array.from({ length: n }, (_, i) => ({
      left: `${Math.round(prand(i, 1) * 92 + 4)}%`,
      top: `${Math.round(prand(i, 2) * 70 + 8)}%`,
      delay: `${(prand(i, 3) * 4).toFixed(2)}s`,
      dur: `${(3 + prand(i, 4) * 3).toFixed(2)}s`,
    }));
  }, [peakV]);

  if (!hourly) return <p className="unavail">Rainfall series unavailable — weather source offline.</p>;
  return (
    <div className="crystalWrap">
      <div className="chartHead">
        <div>
          <div className="metricLabel">Forecast rainfall — next {win}h · calculated from Open-Meteo hourly data</div>
          <div className="bigNum">{total.toFixed(1)} <span>mm</span></div>
          {gaps != null && gaps > 0 && (
            <div className="prov">{gaps} provider-gap hour{gaps === 1 ? "" : "s"} in window — shown as breaks, excluded from total.</div>
          )}
        </div>
        <div className="tabs" role="group" aria-label="Accumulation window">
          {WINDOWS.map((w) => (
            <button key={w} className={`tab crystalTab${w === win ? " active" : ""}`} onClick={() => setWin(w)} aria-pressed={w === win}>
              {w}H
            </button>
          ))}
          {onRefresh && <button className="tab" onClick={onRefresh} aria-label="Refresh rainfall data">↻</button>}
        </div>
      </div>
      <div className={`chart crystalChart int-${intensity}`}>
        <div className="crystalSheen" aria-hidden />
        <div className="crystalScan" aria-hidden />
        {motes.map((m, i) => (
          <span key={i} className="crystalMote" style={{ left: m.left, top: m.top, animationDelay: m.delay, animationDuration: m.dur }} aria-hidden />
        ))}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shown}>
            <defs>
              <linearGradient id="rainG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7df3ff" stopOpacity=".5" />
                <stop offset="100%" stopColor="#4de3ff" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="barGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9defff" stopOpacity=".55" />
                <stop offset="100%" stopColor="#4d7cff" stopOpacity=".06" />
              </linearGradient>
              <filter id="crystalGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <CartesianGrid stroke="rgba(125,220,255,.10)" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: "#7fa3c7", fontSize: 9 }} axisLine={{ stroke: "rgba(125,220,255,.18)" }} tickLine={false} minTickGap={40} label={{ value: "forecast time", position: "insideBottomRight", offset: -2, fill: "#5b6f89", fontSize: 8 }} />
            <YAxis tick={{ fill: "#7fa3c7", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "mm/h", angle: -90, position: "insideLeft", fill: "#5b6f89", fontSize: 8 }} />
            <Tooltip content={<CrystalTip />} cursor={{ stroke: "rgba(125,243,255,.35)", strokeDasharray: "3 3" }} />
            <Bar dataKey="v" fill="url(#barGlass)" radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive animationDuration={1100}>
              {shown.map((r, i) => (
                <Cell key={i} opacity={i === peakIdx ? 0.95 : 0.55} />
              ))}
            </Bar>
            <Area type="monotone" dataKey="v" stroke="#8ff5ff" strokeWidth={2} fill="url(#rainG)" name="mm/h" filter="url(#crystalGlow)" isAnimationActive animationDuration={1400} dot={(d: { cx?: number; cy?: number; index?: number }) => {
              if (d.index === peakIdx && (peakV ?? 0) > 0) {
                return <circle key={d.index} cx={d.cx} cy={d.cy} r={5} fill="#dffbff" stroke="#4de3ff" strokeWidth={2} className="peakDot" />;
              }
              if (d.index === 0) {
                return <circle key={d.index} cx={d.cx} cy={d.cy} r={4} fill="#4de3ff" className="nowDot" />;
              }
              return <circle key={d.index} cx={d.cx} cy={d.cy} r={0} fill="transparent" />;
            }} activeDot={{ r: 4, fill: "#eaffff", stroke: "#4de3ff", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
