# DRISHTI-X Implementation Audit (verified 2026-10-15)

## Repository
- Root: `DRISHTI-X-PS26071/DRISHTI-X-PS26071` (Next.js 15.5.27, React 19.3, TS, npm).
- **No Git repository, no CI workflows, no deployment target configured.**
- Scripts: `dev / build / start / lint / test:unit`. No DB, no auth system.
- Routes: `/`, 6 API routes (weather, nwp, radar, satellite, analysis, data-health, geocode).
- Backend: optional FastAPI mirror (`backend/`), not required at runtime.

## Data paths (all verified live during prior QA)
- Open-Meteo forecast + elevation + ERA5 archive + geocoding: LIVE, keyless.
- RainViewer radar past-frames: LIVE (India coverage sparse — measured, honest).
- NASA GIBS WMTS: LIVE/RECENT; satellite-IR discontinued by provider (removed).
- MOSDAC: AUTH-gated, adapter path only. IMD: no machine API (reference link only).
- Overpass rivers: code-complete, public instance degraded at last probe (OFFLINE-tolerant).

## ML state (v1, executed)
- `training/train_baseline.py` → ERA5 Vijayawada monsoon 2024, 2,898 rows,
  70/15/15 time split, 6h-ahead target. Artifacts: `models/ridge_v1.pkl`,
  `metrics_v1.json`, `features_v1.json`.
- Test: Ridge RMSE 0.94mm beats persistence 1.26mm; heavy-event F1 ≈ 0.
- Live UI runs the transparent weighted-fusion prototype (`lib/engine.ts`),
  NOT the artifact. No leakage controls beyond time ordering (gap: no purge
  window — to fix in v2).

## Risks
- OneDrive file locks corrupt `.next` (operational: one server, clean cache).
- No datastore → no forecast-verification loop, no server warning history.
- No DEM rasters → no depth numbers. No auth → no acknowledgement workflow.
- Heavy events are rare (5 in test window) — metrics will be noisy; report counts.

## Phased tasks
1. Reproduce v1, add purge gaps + candidates (RF/ET/HGB/logreg) + full
   classification metrics (PR-AUC, Brier, confusion, FAR/miss).
2. Select champion on validation; integrate via exact TS port if linear-family.
3. Terrain sampler (Terrarium DEM, keyless) for real slope/lowland inputs.
4. Warning history (localStorage, honestly local-only) + IMD reference link.
5. Unit tests for new logic; docs (model card); full validation.
