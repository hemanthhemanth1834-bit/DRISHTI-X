# DRISHTI-X model-training pipeline (optional architecture)

The shipped UI uses a transparent rule/weighted-fusion prototype
(`lib/engine.ts`, `backend/services/risk.py`) — **not** a trained model.
This directory documents how a genuinely trained model would be built from
free/public sources, without fabricating one for the demo.

## 1. Historical data ingestion (free/public)

- Open-Meteo **ERA5 archive API** (`archive-api.open-meteo.com`): hourly
  precipitation, humidity, pressure, wind, soil moisture for any coordinate,
  1940–present. Script per demo city into `data/raw/<city>.csv`.
- NWP hindcasts: Open-Meteo **previous-runs** (`past_days` + archived model
  runs) for GFS/ICON to build model-spread features.
- Radar: RainViewer history is limited; archive frame metadata with
  timestamps for trend features where available.
- Inundation labels: only from published flood-extent maps (e.g. Sentinel-1
  flood products, government reports). Never synthesize labels.

## 2. Cleaning

Drop provider error codes, unify to UTC, enforce units table in README
(mm, mm/h, °C, hPa, km/h, m³/m³), flag gaps instead of interpolating silently.

## 3. Temporal alignment

Resample all sources to an hourly grid keyed by `(time_utc, lat, lon)`;
keep provenance columns (source, run_time) per row.

## 4. Feature engineering

The 8 fusion features in `FEATURE_DOCS` (lib/engine.ts) become training
columns, plus lags (t−1…t−24 accumulations) and NWP spread/agreement.

## 5. Train/validation/test split

Time-ordered split (e.g. train ≤2022, validate 2023, test 2024 monsoon);
never shuffle time series. Group by monsoon season.

## 6. Model training

Baseline: gradient boosting (scikit-learn HistGradientBoosting / XGBoost)
for rainfall; logistic/multiclass for risk bands; U-Net-style segmentation
only if labelled inundation masks exist.

## 7. Evaluation

`python training/evaluate.py --regression data/holdout_rainfall.csv`
reports MAE / RMSE / R²; `--classification` reports precision / recall /
F1 / ROC-AUC. Inundation masks: IoU + F1. No dataset → the script reports
“Evaluation dataset not configured”.

## 8. Serialization

Versioned artifacts in `models/` (`model_vN.pkl` + `features_vN.json` +
`metrics_vN.json`); never commit large binaries without LFS.

## 9. Inference

Load the pinned artifact behind `/api/rainfall-risk` with the same
normalization code path as training (shared `features_vN.json`).

## 10. Monitoring

Track live MAE vs persistence baseline per city; alert on drift; re-train
seasonally. Until then, the UI keeps the “Transparent AI-assisted
prototype” label.
