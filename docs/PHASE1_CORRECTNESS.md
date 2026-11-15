# Phase 1 — Critical correctness fixes

Branch: `phase-1-critical-correctness`  
Scope: correctness only (no UI redesign, no new datasets, no deployment).

## F01 — Time handling

- Provider wall-clock timestamps are converted at ingestion with
  `toUnixSeconds(iso, utc_offset_seconds)` (`lib/time.ts`).
- All computation and NWP alignment use Unix seconds.
- API payloads emit UTC ISO timestamps plus `timeUnix`; the UI renders IST
  explicitly, independent of the browser or server timezone.
- Regression coverage: `tests/time.test.ts`.

## F02 — Rainfall units

- Open-Meteo `current.precipitation` is a 15-minute amount, not a rate.
- The API exposes `precipitationMM15` (raw amount) and
  `precipitationRateMMH` (`amount × 4`).
- The raw amount is never labelled mm/h; hourly forecast values remain
  millimetres per hour.

## F03 — Missing data

- Missing hours and missing NWP values remain `null`; no zero substitution.
- An accumulation window is withheld (`null`) unless every expected hour exists.
- `accumCoverage` reports completeness for each 1/3/6/12/24/48-hour window.
- Offline NWP models report `OFFLINE` with `null` values and never contribute
  zeros to the ensemble mean.

## F04 — Risk coverage

- All risk inputs are nullable.
- Unavailable feature weights are redistributed over available inputs.
- `coverage01` is returned with the score; zero coverage is labelled
  “not computed”, never `NORMAL`.
- A single responding NWP model keeps its real mean and is not given a fake
  consensus discount.

## F05 — Inundation terminology

- Replaced `prob01` with `riskIndex` (0–100) and `coverage01`.
- Classes: `LOW`, `MODERATE`, `HIGH`, `SEVERE`, `UNKNOWN`.
- Always labelled an uncalibrated model estimate, not a probability and not an
  observed flood extent.

## F06 — Radar health

- `radarHealth()` derives `LIVE` / `DELAYED` / `OFFLINE` from the newest actual
  frame and its age (stale threshold 120 minutes).
- The analysis route passes real radar health into the engine instead of a
  hardcoded `READY`.

## F07 — System status

- `SYSTEM ONLINE` / `DEGRADED` / `OFFLINE` and header data labels are derived
  from weather, NWP, radar and satellite health.
- AI status is derived from analysis availability and risk coverage.

## F08 — Provider reliability

- Shared `getJSON` has a 7-second timeout and one safe retry on network errors,
  429 and 5xx; 4xx is not retried.
- Timers are cleared in `finally` in provider, river, terrain and health probes.
- Analysis route sets `maxDuration = 30` for bounded serverless headroom.

## Verification

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — 45/45 passing.
- `npm run lint` — clean.
- `npm run build` — production build succeeds.
- Local API smoke: page, weather, analysis, NWP, radar, satellite and data
  health return 200; nulls and coverage fields are present in live responses.

## Remaining limitations

- Inundation is still a heuristic risk index without DEM/slope/flow or
  flood-depth observations.
- The experimental ML classifier is excluded from warning severity.
- No datastore, so acknowledgement/history is client-local.
- No deployment is performed from this branch without approval.
