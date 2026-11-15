"use client";
import { useEffect, useState } from "react";

interface Entry {
  t: string;
  level: string;
  score: number;
  label: string;
}

const KEY = "drishti-warnings";

/**
 * Session warning history (local-only: no auth/storage backend exists, so
 * acknowledgement cannot persist server-side — stated honestly in-UI).
 * Appends when the computed warning level/score changes; caps at 20.
 */
export default function WarningHistory({ level, score, label }: { level?: string; score?: number; label: string }) {
  const [log, setLog] = useState<Entry[]>([]);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Entry[];
      setLog(Array.isArray(raw) ? raw.slice(-20) : []);
    } catch {
      setLog([]);
    }
  }, []);

  useEffect(() => {
    if (!level || score == null) return;
    setLog((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.level === level && last.score === score && last.label === label) return prev;
      const next = [...prev, { t: new Date().toISOString(), level, score, label }].slice(-20);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* session-only fallback */
      }
      return next;
    });
  }, [level, score, label]);

  return (
    <div className="panel explain">
      <div className="metricLabel">Warning history — this browser only (no login system exists for server acknowledgement)</div>
      {log.length === 0 ? (
        <p className="prov">No warnings recorded this session yet.</p>
      ) : (
        <div className="xaiRows">
          {[...log].reverse().map((e, i) => (
            <div className="xaiRow" key={`${e.t}-${i}`}>
              <span className="xaiName">{e.level} · {e.score}/100</span>
              <span className="prov">{e.label}</span>
              <span className="prov">{e.t}</span>
            </div>
          ))}
        </div>
      )}
      <p className="prov">
        Official alerts:{" "}
        <a href="https://mausam.imd.gov.in" target="_blank" rel="noreferrer" style={{ color: "#7fc9ff" }}>
          IMD Mausam (authoritative, opens externally)
        </a>
        . DRISHTI-X warnings above are computed decision support, never IMD warnings.
      </p>
    </div>
  );
}
