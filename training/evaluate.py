#!/usr/bin/env python3
"""DRISHTI-X evaluation framework (pure stdlib, no fabricated data).

Usage:
  python training/evaluate.py --regression data/holdout_rainfall.csv --target y_true --pred y_pred
  python training/evaluate.py --classification data/holdout_risk.csv --target y_true --pred y_pred
  python training/evaluate.py --segmentation data/holdout_inundation.npz  (documented; needs numpy)

Without a configured dataset it prints "Evaluation dataset not configured"
instead of invented metrics.
"""
from __future__ import annotations
import argparse, csv, math, os, sys


def load_csv(path: str, target: str, pred: str):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    return [float(r[target]) for r in rows], [float(r[pred]) for r in rows]


def regression(y, p):
    n = len(y)
    mae = sum(abs(a - b) for a, b in zip(y, p)) / n
    rmse = math.sqrt(sum((a - b) ** 2 for a, b in zip(y, p)) / n)
    mean = sum(y) / n
    ss_tot = sum((a - mean) ** 2 for a in y)
    r2 = 1 - sum((a - b) ** 2 for a, b in zip(y, p)) / ss_tot if ss_tot else float("nan")
    return {"n": n, "MAE_mm": round(mae, 3), "RMSE_mm": round(rmse, 3), "R2": round(r2, 4)}


def classification(y, p, thr=0.5):
    yp = [1 if v >= thr else 0 for v in p]
    yt = [1 if v >= thr else 0 for v in y]
    tp = sum(1 for a, b in zip(yt, yp) if a == 1 and b == 1)
    fp = sum(1 for a, b in zip(yt, yp) if a == 0 and b == 1)
    fn = sum(1 for a, b in zip(yt, yp) if a == 1 and b == 0)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    # ROC-AUC via Mann-Whitney rank statistic on continuous scores.
    order = sorted(range(len(y)), key=lambda i: p[i])
    ranks = [0.0] * len(y)
    for r, i in enumerate(order, 1):
        ranks[i] = r
    pos = [ranks[i] for i in range(len(y)) if y[i] >= thr]
    neg = [ranks[i] for i in range(len(y)) if y[i] < thr]
    auc = (sum(pos) - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)) if pos and neg else float("nan")
    return {"n": len(y), "precision": round(prec, 4), "recall": round(rec, 4),
            "F1": round(f1, 4), "ROC_AUC": round(auc, 4) if auc == auc else "n/a"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--regression", help="CSV with true/predicted rainfall (mm)")
    ap.add_argument("--classification", help="CSV with true/predicted risk scores")
    ap.add_argument("--target", default="y_true")
    ap.add_argument("--pred", default="y_pred")
    a = ap.parse_args()
    if a.regression:
        if not os.path.exists(a.regression):
            print("Evaluation dataset not configured:", a.regression);
            return 2
        y, p = load_csv(a.regression, a.target, a.pred)
        print(regression(y, p));
        return 0
    if a.classification:
        if not os.path.exists(a.classification):
            print("Evaluation dataset not configured:", a.classification);
            return 2
        y, p = load_csv(a.classification, a.target, a.pred)
        print(classification(y, p));
        return 0
    print("Evaluation dataset not configured — pass --regression or --classification with a real holdout CSV.");
    return 2


if __name__ == "__main__":
    sys.exit(main())
