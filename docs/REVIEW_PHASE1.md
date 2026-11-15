# Phase 1.1 — Independent correctness review

Date: 2026-11-15  
Scope: complete Phase 1 diff (`a487103..91c7fb1`), F01–F08  
Status: **corrections applied and verified; no production deployment**

## Method

1. Read the full Phase 1 diff and the affected engine/provider/API contracts.
2. Re-ran type checking and the complete unit suite.
3. Exercised edge cases: offset-less provider timestamps, 15-minute amounts,
   incomplete accumulation windows, single-model NWP, zero-coverage risk,
   stale/absent radar frames, and inference-time feature construction.
4. Checked UI strings for probability/observation claims and null fallbacks.

## Findings and dispositions

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | **High** | ML inference used `getUTCHours()` for `hod_sin`/`hod_cos`, but training used IST hour-of-day. The feature was shifted by 5.5 hours, silently changing the experimental score. | Fixed with `istHourFromUnix()` and tests for 21:45, midnight, and 05:30 IST. Generator template updated so regeneration cannot reintroduce the bug. |
| R2 | Medium | `/api/analysis` fell back to the provider's offset-less local time string when `timeUnix` was unavailable, breaking the UTC-only API contract. | `current.time` and provenance time are now UTC ISO or `null`; provider wall time is exposed separately as `timeLocal`. |
| R3 | Medium | Accumulation windows were implemented inside the route and had no direct regression tests. | Extracted to `lib/accum.ts`; added complete/missing/out-of-range/past-window tests. |
| R4 | Medium | `RainChart` displayed a partial total when the selected window contained provider gaps (it only disclosed the exclusion in small text). | Window total is now withheld (`—`) whenever the selected window is incomplete; gap count is shown explicitly. Chart structure preserved. |
| R5 | Low | Inundation note said no DEM was connected while the response also appended point-DEM context, which was contradictory. | Reworded: point DEM context only; no slope/flow/drainage model; no depth/extent computed. |
| R6 | Low | Analysis error response echoed the raw upstream exception. | Generic client error; full detail logged server-side only. |
| R7 | Review note | Low-coverage risk scores can still produce a warning band, with coverage disclosed. This is intentional in Phase 1 but is a release-gate concern. | Deferred to Phase 2 contract work (coverage-aware warning policy). |
| R8 | Review note | No rate limiting / request budget yet. | Deferred to Phase 2 security work. |

## F01–F08 verification

- **F01 time:** ingestion converts wall time + offset to Unix; APIs emit UTC ISO; UI is IST. `istHourFromUnix` closes the remaining local-hour gap.
- **F02 units:** raw 15-minute amount and converted rate are separate fields; tests cover ×4 and null/negative.
- **F03 missing data:** window totals are withheld on missing hours; NWP zeros removed; `accumCoverage` and `hourlyGaps` exposed.
- **F04 risk:** nullable inputs, renormalized weights, coverage reported; zero coverage cannot become a normal warning.
- **F05 inundation:** only `riskIndex`/`coverage01`/`class`; no `prob01`; `UNKNOWN` when no factors.
- **F06 radar:** health from newest actual frame; no READY constant in analysis.
- **F07 system status:** computed from weather/NWP/radar/satellite; header maps to LIVE/PARTIAL/NO/AWAITING.
- **F08 reliability:** timeouts, one transient retry, timer cleanup, bounded analysis duration.

## Verification evidence

- `npx tsc --noEmit`: clean.
- `npm run test:unit`: **52/52 passed**.
- `npm run lint`: clean.
- `npm run build`: exit 0.
- Local API smoke: page and weather/analysis/nwp/radar/satellite/data-health return 200;
  analysis exposes UTC timestamps, nullable fields, coverage, risk index, and radar health.

## Residual limitations (documented, not hidden)

- Risk fusion and inundation index are transparent heuristics, not calibrated probabilities.
- ML classifier is experimental and display-only; validation has only 5 test events.
- No DEM flow/slope/drainage model, no flood depth/extent, no observation network.
- No datastore/auth: alert history is browser-local; no acknowledgement workflow.
- Upstream provider outages are surfaced honestly; no synthetic fallback values.
