# Model card — DRISHTI-X rainfall ML v2 (2026-10)

## Intended use
Research decision-support signal for SIH PS-26071 demos: 6h-ahead heavy-rain
probability from local rainfall history. NOT an operational warning, NOT IMD.

## Training data
Open-Meteo ERA5 archive (free), Vijayawada (16.51, 81.78), 2024-06-01 to
2024-09-30 hourly precipitation (2,898 rows). Units mm/h. Gaps zero-filled
with a count feature (documented in `train_v2.py`).

## Method
Features: lags 1,2,3,6,12,24 + 24h sum + gap count + hour-of-day sin/cos.
Chronological 70/15/15 split with 30h purge gaps. Seed 42.
Candidates: persistence, Ridge, RandomForest, ExtraTrees, HGB regressors;
balanced LogisticRegression, RF, HGB classifiers. Heavy event: ≥5mm target hour.

## Results (test set, n=404, 5 true events)
| model | MAE | RMSE | precision | recall | F1 | PR-AUC | FAR |
|---|---|---|---|---|---|---|---|
| persistence | 0.44 | 1.31 | 0.00 | 0.00 | 0.00 | — | 0.01 |
| ridge | 0.49 | 0.98 | 0.00 | 0.00 | 0.00 | — | 0.00 |
| random_forest | 0.49 | 0.98 | 0.00 | 0.00 | 0.00 | — | 0.00 |
| hgb (reg) | 0.51 | 1.01 | 0.00 | 0.00 | 0.00 | — | 0.00 |
| logreg_bal | — | — | 0.01 | 0.20 | 0.02 | 0.04 | 0.30 |
| hgb_clf_bal | — | — | 1.00 | 0.20 | 0.33 | 0.22 | 0.00 |

## Selection
Champion by validation PR-AUC: `logreg_bal` (0.18 valid). Integrated via
exact TypeScript port (`training/export_ts.py` → `lib/ml.ts`, parity-tested).
Displayed as an experimental signal with its metrics; excluded from the
warning score. Test-set skill is weak (5 events) — unvalidated for operations.

## Limitations
Single location/season; no NWP inputs; uncalibrated probabilities; rare-event
noise dominates (report counts, not just rates). See `training/README.md §10.
