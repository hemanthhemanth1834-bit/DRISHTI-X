"use client";
import type { SourceStatus } from "@/lib/locations";
import { ageLabel, fmtClock } from "@/lib/format";

const dot: Record<string, string> = {
  LIVE: "#3cff9a",
  RECENT: "#6feaff",
  READY: "#6feaff",
  DELAYED: "#ffc857",
  DEGRADED: "#ffc857",
  AUTH: "#ffc857",
  DEMO: "#9b6cff",
  OFFLINE: "#ff6b86",
};

export function StatusDot({ status, size = 7 }: { status: SourceStatus; size?: number }) {
  return (
    <span
      aria-label={status}
      style={{ width: size, height: size, borderRadius: "50%", background: dot[status] ?? "#8190a8", boxShadow: `0 0 10px ${dot[status] ?? "#8190a8"}`, display: "inline-block" }}
    />
  );
}

export function StatusBadge({ status }: { status: SourceStatus }) {
  return (
    <span className={`badge b-${status}`} role="status">
      <StatusDot status={status} size={6} /> {status}
    </span>
  );
}

export default function StatusBar({
  items,
  lastUpdated,
  nextIn,
  onRefresh,
  loading,
}: {
  items: { label: string; status: SourceStatus }[];
  lastUpdated: string;
  nextIn: number;
  onRefresh: () => void;
  loading: boolean;
}) {
  const mm = Math.floor(nextIn / 60000);
  const ss = Math.floor((nextIn % 60000) / 1000);
  return (
    <div className="statusbar" role="status" aria-label="System status">
      <div className="sbGroup">
        {items.map((i) => (
          <span key={i.label} className="sbItem">
            <StatusDot status={i.status} /> {i.label}
            <em>{i.status}</em>
          </span>
        ))}
      </div>
      <div className="sbGroup sbRight">
        <span className="sbMeta" title={lastUpdated}>
          FETCHED {lastUpdated ? fmtClock(lastUpdated) : "—"} · {ageLabel(lastUpdated)}        </span>
        <span className="sbMeta">
          NEXT {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </span>
        <button className="tab" onClick={onRefresh} disabled={loading} aria-label="Refresh all data">
          {loading ? "SYNC…" : "REFRESH"}
        </button>
      </div>
    </div>
  );
}
