/**
 * Timezone-safe conversion for Open-Meteo payloads.
 *
 * With `timezone=auto`, Open-Meteo returns offset-less local wall-clock strings
 * plus `utc_offset_seconds`. Parsing those strings directly would use the
 * server's timezone (UTC on Vercel), silently shifting every computation.
 * Parse as UTC, then subtract the provider's explicit offset to obtain the real
 * Unix instant. Presentation converts Unix seconds to IST separately.
 */
export function toUnixSeconds(localIso: string, utcOffsetSeconds: number): number | null {
  if (typeof localIso !== "string" || !localIso) return null;
  const trimmed = localIso.endsWith("Z") ? localIso.slice(0, -1) : localIso;
  const ms = Date.parse(`${trimmed.slice(0, 19)}Z`);
  return Number.isFinite(ms) ? Math.round(ms / 1000 - utcOffsetSeconds) : null;
}
