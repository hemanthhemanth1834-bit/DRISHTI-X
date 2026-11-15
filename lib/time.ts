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

/**
 * Local hour-of-day in India (UTC+05:30, no DST) from a real Unix instant.
 * Training used IST hour-of-day; using UTC here would shift the ML feature by
 * 5.5 hours. Kept as an explicit fixed offset because the application scope is
 * India and IST has no daylight-saving transitions.
 */
export function istHourFromUnix(unixSeconds: number): number {
  const IST_OFFSET_SEC = 19800;
  return Math.floor((((unixSeconds + IST_OFFSET_SEC) % 86400) + 86400) % 86400 / 3600);
}
