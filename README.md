# DRISHTI-X – SIH PS 26071

> **Live demo:** https://drishti-x-eight.vercel.app

## Project purpose

AI/ML-based integrated heavy-rainfall early-warning and inundation-prediction
command center using satellite, radar, observational weather and NWP model data.
Strict scope: heavy rainfall → early warning → inundation prediction. No
unrelated disaster modules.

## PS 26071 mapping

| Requirement | Implementation |
|---|---|
| Satellite data | NASA GIBS true-color + 7-2-1 false color (`/api/satellite`, ImageryCards, map overlays) |
| Radar data | RainViewer animated tiles (`/api/radar`, CommandMap timeline) |
| Observational weather | Open-Meteo current + hourly (`/api/weather`) |
| NWP model data | ECMWF IFS / GFS / ICON / GEM via Open-Meteo (`/api/nwp`) |
| AI/ML prediction | Transparent weighted-fusion prototype (`lib/engine.ts`); training path in `training/` |
| Inundation prediction | Model-estimate probability + class (`computeRisk().inundation`) |
| Early warning | 5-level threshold engine + drivers (WarningCard, XAI panel) |

## System architecture

```
providers (Open-Meteo/RainViewer/GIBS)
  → Next.js /api routes (fetch, cache 60s–24h, validate, normalize)
  → /api/analysis (feature extraction, NWP window alignment, engine)
  → useDrishti hook (polling, statuses, countdowns)
  → visualization (map, charts, warning, XAI, fabric)
Optional mirror: backend/ FastAPI (same providers + mirrored risk math).
```

## Data sources

All free, no keys: Open-Meteo (weather/NWP/elevation), RainViewer radar
(512px past-frame tiles; satellite-IR discontinued by the provider in 2026
and not offered),
NASA GIBS (imagery), OpenStreetMap/CARTO (basemap). MOSDAC/ISRO is an
AUTH-gated adapter path only. Upstream failure → `OFFLINE` payload, never
fake data. See Methodology drawer in-app for attribution.

## Data flow & units

Units: rainfall mm, intensity mm/h, temperature °C, pressure hPa, wind km/h
(Open-Meteo native), soil moisture m³/m³ (provider-native, labelled),
coordinates decimal degrees. Times are location-local ISO (IST scope, labelled
IST in UI) with UTC `fetchedAt` provenance. Data age shown per panel.

## AI engine

Rule/weighted fusion, 8 features, weights sum to 100 (`FEATURE_DOCS` in
`lib/engine.ts`, formula + table in the Methodology drawer). Missing features
are excluded and remaining weights renormalized (reported in-UI). Labelled
**Transparent AI-assisted prototype** — not deep learning, not operational AI,
not an IMD prediction.

## Inundation engine

`0.42·acc24 + 0.22·intensity + 0.14·soil + 0.12·antecedent + 0.10·elevation`
→ LOW/MODERATE/HIGH/SEVERE. Always **MODEL ESTIMATE — NOT OBSERVED FLOOD
EXTENT**. No DEM/slope/drainage connected (`lib/terrain.ts` interface ready).

## NWP consensus

Models compared over an **aligned common-timestamp 24h window** (offline
models excluded, never zero-filled). Agreement = `1 − σ/μ` (1.0 when all dry);
spread = max−min (mm); confidence HIGH/MODERATE/LOW from availability + spread
— statistical only, never called “AI confidence”. Run/init times are not
published by the provider (stated in-UI).

## Warning logic

Score bands NORMAL ≥0 / WATCH ≥20 / ALERT ≥40 / SEVERE ≥60 / EXTREME ≥80 —
**DRISHTI-X AI-assisted thresholds (research; not IMD official thresholds)**.
Top-4 contributing drivers shown per warning with live values.

## Limitations (scientific)

No DEM/slope/drainage rasters (point elevation + OSM river context only);
NWP run times unpublished; IST-scope time assumption; provider latency
governs freshness; inundation rings are schematic; warnings are research
analysis, not official alerts. The live UI runs the transparent
weighted-fusion prototype, not the trained artifact below.

## Model training (executed, not claimed)

`python training/train_baseline.py` on ERA5 Vijayawada monsoon 2024
(2,898 rows, 70/15/15 time split, 6h-ahead target). Test results in
`models/metrics_v1.json`: Ridge RMSE 0.94mm beats persistence 1.26mm, but
heavy-event detection has ~zero skill (F1 0.0) — local lags alone cannot
predict 6h heavy events. Next step per `training/README.md`: NWP features.

## Implementation status (verified this release)

- Plausibility gates (`lib/quality.ts`): out-of-range inputs excluded +
  renormalized with disclosure; warnings carry validity window + dedupe key.
- Rivers: OSM Overpass context (name/kind/distance) in analysis + inundation
  factors; offline-tolerant. No DEM rasters — stated as a blocker below.
- Tests: `npm run test:unit` — 23 assertions over engine/normalize/quality.
- IMD: no free machine-readable warning API exists; official warnings
  referenced at mausam.imd.gov.in, never presented as ours.

## Known blockers (not implemented — no data/access)

- No git repository / CI / deployment target configured in this workspace.
- No DEM/slope/flow rasters or flood-depth observations → no depth numbers.
- No datastore → no forecast-verification-against-observation loop yet.
- No auth system → no warning acknowledgement workflow.
- IMD/MOSDAC machine data require access the project does not hold.

## Demo mode

“Analyze location” + 9 demo cities fetch **real** per-coordinate data with a
DEMO-location / LIVE-data distinction. PipelineTrace strip shows
ingestion → fusion → AI → rainfall → inundation → warning with live statuses.

## Local development

```bash
npm install
npm run dev    # http://localhost:3000 and http://192.168.7.12:3000
npm run lint
npm run build
```

## API endpoints

`GET /api/weather?lat&lon` · `/api/nwp?lat&lon` · `/api/radar` ·
`/api/satellite` · `/api/analysis?lat&lon&label` · `/api/data-health`.
Coords validated (−90…90, −180…180); upstream errors → `OFFLINE` JSON (502),
never fabricated values. No secrets in client bundles (only optional
`NEXT_PUBLIC_API_BASE_URL`); provider calls are server-side.
