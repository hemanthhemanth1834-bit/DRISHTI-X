/**
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *   python training/train_v2.py && python training/export_ts.py
 * Source: models/linear_v2.json (validated artifact, version v2).
 * Model: class-balanced logistic regression, P(precip(t+6h) >= 5.0 mm).
 * Holdout test (chronological, n=404, 5 true events): PR-AUC 0.0437,
 * precision 0.0084, recall 0.2, false-alarm rate 0.2957, Brier 0.17568.
 * STATUS: experimental / unvalidated for operations — high false-alarm rate.
 * Shown in-UI beside these metrics, never fed into the warning score.
 */
export const ML_VERSION = "v2";
export const ML_HEAVY_MM = 5.0;
export const ML_FEATURES = ["lag1", "lag2", "lag3", "lag6", "lag12", "lag24", "sum24", "gaps24", "hod_sin", "hod_cos"];
export const ML_LOGREG_COEF: number[] = [-0.11888067897516584, -0.002786471904384296, -0.015071224692294717, 0.02587620751431345, 0.07340542395473257, -0.5885695284452049, 0.05735426836183901, 0.0, -0.2592127362035488, -0.9524194190069126];
export const ML_LOGREG_INTERCEPT = -0.829977147922136;
export const ML_VALIDATION = {"pr_auc": 0.0437, "far": 0.2957, "events": 5, "n": 404};

/** Feature vector MUST match training order. Null = incomplete history. */
export function buildMlFeatures(pastHourly: (number | null)[], hourUtc: number): number[] | null {
  // pastHourly[i] = precipitation i hours ago (i=1 is last hour).
  const need = [1, 2, 3, 6, 12, 24];
  for (const l of need) {
    if (pastHourly[l] == null) return null;
  }
  const lags = need.map((l) => pastHourly[l] as number);
  let sum24 = 0;
  let gaps24 = 0;
  for (let l = 1; l <= 24; l++) {
    const v = pastHourly[l];
    if (v == null) gaps24++;
    else sum24 += v;
  }
  const hod = ((hourUtc % 24) / 24) * 2 * Math.PI;
  return [...lags, sum24, gaps24, Math.sin(hod), Math.cos(hod)];
}

/** Calibrated? NO — raw sigmoid score. Displayed with validation metrics. */
export function mlHeavyProbability(features: number[]): number {
  let z = ML_LOGREG_INTERCEPT;
  for (let i = 0; i < features.length; i++) z += features[i] * ML_LOGREG_COEF[i];
  return 1 / (1 + Math.exp(-z));
}
