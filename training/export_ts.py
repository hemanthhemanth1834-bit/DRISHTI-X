#!/usr/bin/env python3
"""Export validated linear weights to TypeScript for exact inference parity.

Reads models/linear_v2.json (produced by train_v2.py) and writes lib/ml.ts
with embedded coefficients, so the app runs the identical math:
same features, order, units, missing-value rules. Any retrain that changes
weights must re-run this script (CI: diff check recommended).
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INP = os.path.join(ROOT, "models", "linear_v2.json")
OUTP = os.path.join(ROOT, "lib", "ml.ts")


def main():
    with open(INP) as f:
        m = json.load(f)
    with open(os.path.join(ROOT, "models", "metrics_v2.json")) as f:
        metrics = json.load(f)
    champ = metrics["selection"]["champion"]
    logreg_test = metrics["classifiers"]["logreg_bal"]["test"]
    ts = """/**
 * GENERATED FILE — do not hand-edit. Regenerate with:
 *   python training/train_v2.py && python training/export_ts.py
 * Source: models/linear_v2.json (validated artifact, version %(ver)s).
 * Model: class-balanced logistic regression, P(precip(t+6h) >= %(heavy)s mm).
 * Holdout test (chronological, n=%(n)s, %(events)s true events): PR-AUC %(prauc)s,
 * precision %(prec)s, recall %(rec)s, false-alarm rate %(far)s, Brier %(brier)s.
 * STATUS: experimental / unvalidated for operations — high false-alarm rate.
 * Shown in-UI beside these metrics, never fed into the warning score.
 */
export const ML_VERSION = "%(ver)s";
export const ML_HEAVY_MM = %(heavy)s;
export const ML_FEATURES = %(feats)s;
export const ML_LOGREG_COEF: number[] = %(coef)s;
export const ML_LOGREG_INTERCEPT = %(icept)s;
export const ML_VALIDATION = %(val)s;

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
  const hod = ((hourUtc %% 24) / 24) * 2 * Math.PI;
  return [...lags, sum24, gaps24, Math.sin(hod), Math.cos(hod)];
}

/** Calibrated? NO — raw sigmoid score. Displayed with validation metrics. */
export function mlHeavyProbability(features: number[]): number {
  let z = ML_LOGREG_INTERCEPT;
  for (let i = 0; i < features.length; i++) z += features[i] * ML_LOGREG_COEF[i];
  return 1 / (1 + Math.exp(-z));
}
"""
    with open(OUTP, "w", encoding="utf-8") as f:
        f.write(ts % {
            "ver": m["version"], "heavy": m["heavy_mm"], "n": logreg_test["n"],
            "events": logreg_test["events_true"], "prauc": logreg_test["PR_AUC"],
            "prec": logreg_test["precision"], "rec": logreg_test["recall"],
            "far": logreg_test["false_alarm_rate"], "brier": logreg_test["brier"],
            "feats": json.dumps(m["features"]),
            "coef": json.dumps(m["logreg"]["coef"]), "icept": m["logreg"]["intercept"],
            "val": json.dumps({"pr_auc": logreg_test["PR_AUC"], "far": logreg_test["false_alarm_rate"],
                               "events": logreg_test["events_true"], "n": logreg_test["n"]}),
        })
    print("wrote", OUTP)


if __name__ == "__main__":
    main()
