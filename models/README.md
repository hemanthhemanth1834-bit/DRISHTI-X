# models/ — versioned trained artifacts

`ridge_v1.pkl` + `features_v1.json` + `metrics_v1.json`: genuinely trained
2026-10 run (see `training/train_baseline.py`). 6h-ahead rainfall from ERA5
Vijayawada monsoon 2024 (2,898 hourly rows, time-ordered 70/15/15 split).
Test-set results: persistence MAE 0.41mm / RMSE 1.26mm; Ridge MAE 0.47mm /
RMSE 0.94mm. Heavy-event (≥5mm/6h) detection has ~zero skill from local
lags alone (test F1 0.0, 5 true events) — documented limitation, not a
production claim. The live UI still runs the transparent weighted-fusion
prototype (`lib/engine.ts`), not this artifact.
