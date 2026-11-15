/**
 * Time handling contract: Open-Meteo `timezone=auto` returns ISO timestamps in
 * the *location's* local zone without an offset. All demo locations are in
 * India (IST, UTC+5:30, no DST), so parsing in the browser zone is consistent
 * for the India-first scope. UI labels always say IST explicitly; UTC is kept
 * in provenance payloads. If non-IST locations are ever added, pass explicit
 * offsets instead of relying on this assumption.
 */
export const IST = "Asia/Kolkata";

export function fmtIST(iso: string, withSec = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleString("en-IN", {
      timeZone: IST,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      ...(withSec ? { second: "2-digit" as const } : {}),
      hour12: false,
    }) + " IST"
  );
}

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) +
    " IST"
  );
}

/** Whole minutes between an ISO timestamp and now; null when unparseable. */
export function ageMinutes(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export function ageLabel(iso: string | undefined): string {
  const m = ageMinutes(iso);
  if (m == null) return "age unknown";
  if (m < 1) return "age <1 min";
  if (m < 60) return `age ${m} min`;
  return `age ${Math.floor(m / 60)}h ${m % 60}m`;
}
