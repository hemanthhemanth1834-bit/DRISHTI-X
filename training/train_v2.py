#!/usr/bin/env python3
"""V2 model comparison: purge gaps, tree/GBM candidates, full event metrics.

Target: 6h-ahead precipitation (mm), Vijayawada ERA5 monsoon 2024.
Heavy event: >= 5.0 mm in the target hour. Chronological 70/15/15 split
with a 30h purge gap (max lag 24h + 6h horizon) at each boundary.
Selection: validation PR-AUC first (heavy-event skill), RMSE second.

Usage: python training/train_v2.py [--no-fetch]
"""
from __future__ import annotations
import argparse, csv, json, math, os, urllib.request

RAW = os.path.join("data", "raw", "vijayawada_era5_2024monsoon.csv")
LAT, LON = 16.51, 81.78
LAGS = [1, 2, 3, 6, 12, 24]
HORIZON, HEAVY_MM, GAP = 6, 5.0, 30
SEED = 42


def load_rows(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    return [(r["time_utc"], float(r["precip_mm"]) if r["precip_mm"] != "" else None) for r in rows]


def build_frame(rows):
    vals = [v if v is not None else 0.0 for _, v in rows]
    gaps = [0 if v is not None else 1 for _, v in rows]
    X, y, meta = [], [], []
    for i in range(max(LAGS), len(vals) - HORIZON):
        feats = [vals[i - l] for l in LAGS] + [sum(vals[i - 24:i]), sum(gaps[i - 24:i])]
        hod = (i % 24) / 24 * 2 * math.pi
        X.append(feats + [math.sin(hod), math.cos(hod)])
        y.append(vals[i + HORIZON])
        meta.append(rows[i][0])
    return X, y, meta


def mean(xs):
    return sum(xs) / len(xs)


def mae(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def rmse(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / len(a))


def brier(yt, proba):
    return sum((p - a) ** 2 for a, p in zip(yt, proba)) / len(yt)


def clf_metrics(yt, yp, proba=None):
    tp = sum(1 for a, b in zip(yt, yp) if a and b)
    fp = sum(1 for a, b in zip(yt, yp) if not a and b)
    fn = sum(1 for a, b in zip(yt, yp) if a and not b)
    tn = sum(1 for a, b in zip(yt, yp) if not a and not b)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    out = {"precision": round(prec, 4), "recall": round(rec, 4),
           "F1": round(2 * prec * rec / (prec + rec), 4) if prec + rec else 0.0,
           "false_alarm_rate": round(fp / (fp + tn), 4) if fp + tn else 0.0,
           "miss_rate": round(fn / (fn + tp), 4) if fn + tp else 0.0,
           "events_true": sum(yt), "n": len(yt),
           "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn}}
    if proba is not None:
        from sklearn.metrics import average_precision_score
        try:
            out["PR_AUC"] = round(float(average_precision_score(yt, proba)), 4)
        except Exception:
            out["PR_AUC"] = 0.0
        out["brier"] = round(brier(yt, proba), 5)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(RAW):
        raise SystemExit("missing dataset; run train_baseline.py first (no synthetic data).")
    rows = load_rows(RAW)
    X, y, meta = build_frame(rows)
    n = len(X)
    i1, i2 = int(n * 0.7), int(n * 0.85)
    # Purge gaps: no sample within GAP hours of a split boundary.
    keep = [i for i in range(n) if abs(i - i1) > GAP and abs(i - i2) > GAP]
    tr = [i for i in keep if i < i1]
    va = [i for i in keep if i1 < i < i2]
    te = [i for i in keep if i > i2]
    splits = {k: ([X[i] for i in idx], [y[i] for i in idx]) for k, idx in
              [("train", tr), ("validate", va), ("test", te)]}
    print("n=%d train=%d validate=%d test=%d purged=%d" % (n, len(tr), len(va), len(te), n - len(keep)))

    from sklearn.linear_model import Ridge, LogisticRegression
    from sklearn.ensemble import RandomForestRegressor, ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestClassifier
    from sklearn.ensemble import HistGradientBoostingClassifier

    cands = {
        "persistence": None,
        "ridge": Ridge(alpha=1.0, random_state=SEED),
        "random_forest": RandomForestRegressor(n_estimators=200, min_samples_leaf=5, random_state=SEED, n_jobs=-1),
        "extra_trees": ExtraTreesRegressor(n_estimators=200, min_samples_leaf=5, random_state=SEED, n_jobs=-1),
        "hgb": HistGradientBoostingRegressor(max_iter=300, learning_rate=0.06, random_state=SEED),
    }
    clf_cands = {
        "logreg_bal": LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED),
        "rf_clf_bal": RandomForestClassifier(n_estimators=200, min_samples_leaf=5, class_weight="balanced_subsample", random_state=SEED, n_jobs=-1),
        "hgb_clf_bal": HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, class_weight="balanced", random_state=SEED),
    }
    results: dict = {"version": "v2", "seed": SEED, "gap_h": GAP, "heavy_mm": HEAVY_MM,
                     "periods": {k: [meta[idx[0]], meta[idx[-1]]] for k, idx in [("train", tr), ("validate", va), ("test", te)]},
                     "regressors": {}, "classifiers": {}}
    Xtr, ytr = splits["train"]
    for name, model in cands.items():
        if model is not None:
            model.fit(Xtr, ytr)
        entry = {}
        for split in ("validate", "test"):
            Xs, ys = splits[split]
            pred = [max(0.0, v) for v in (Xs and [row[0] for row in Xs] if name == "persistence" else model.predict(Xs).tolist())]
            yt = [1 if v >= HEAVY_MM else 0 for v in ys]
            yp = [1 if v >= HEAVY_MM else 0 for v in pred]
            entry[split] = {"n": len(ys), "MAE_mm": round(mae(ys, pred), 4), "RMSE_mm": round(rmse(ys, pred), 4),
                            "bias_mm": round(mean(pred) - mean(ys), 4), **clf_metrics(yt, yp)}
        results["regressors"][name] = entry
        print(name, json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "n"} for k, v in entry.items()}))

    ytr_b = [1 if v >= HEAVY_MM else 0 for v in ytr]
    for name, model in clf_cands.items():
        model.fit(Xtr, ytr_b)
        entry = {}
        for split in ("validate", "test"):
            Xs, ys = splits[split]
            yt = [1 if v >= HEAVY_MM else 0 for v in ys]
            proba = model.predict_proba(Xs)[:, 1].tolist()
            yp = [1 if p >= 0.5 else 0 for p in proba]
            entry[split] = clf_metrics(yt, yp, proba)
            entry[split]["n"] = len(ys)
        results["classifiers"][name] = entry
        print(name, json.dumps({k: v for k, v in entry.items()}))

    # Selection on validation: PR-AUC first, test RMSE second.
    scored = []
    for name, m in results["classifiers"].items():
        scored.append((m["validate"].get("PR_AUC", 0), name))
    scored.sort(reverse=True)
    results["selection"] = {"policy": "validation PR-AUC, then test RMSE",
                            "ranking": scored,
                            "champion": scored[0][1] if scored else None}
    print("CHAMPION:", results["selection"]["champion"])

    os.makedirs("models", exist_ok=True)
    with open("models/metrics_v2.json", "w") as f:
        json.dump(results, f, indent=2)
    import pickle
    best = {"logreg_bal": clf_cands["logreg_bal"], "rf_clf_bal": clf_cands["rf_clf_bal"], "hgb_clf_bal": clf_cands["hgb_clf_bal"]}[results["selection"]["champion"]]
    with open("models/champion_v2.pkl", "wb") as f:
        pickle.dump({"kind": "classifier", "name": results["selection"]["champion"], "model": best,
                     "lags": LAGS, "horizon": HORIZON, "heavy_mm": HEAVY_MM}, f)
    # Export linear coefficients for an exact TypeScript port (logreg + ridge).
    lr = LogisticRegression(max_iter=2000, class_weight="balanced", random_state=SEED).fit(Xtr, ytr_b)
    rg = Ridge(alpha=1.0, random_state=SEED).fit(Xtr, ytr)
    feats = ["lag%d" % l for l in LAGS] + ["sum24", "gaps24", "hod_sin", "hod_cos"]
    with open("models/linear_v2.json", "w") as f:
        json.dump({"features": feats,
                   "logreg": {"coef": lr.coef_[0].tolist(), "intercept": float(lr.intercept_[0])},
                   "ridge": {"coef": rg.coef_.tolist(), "intercept": float(rg.intercept_)},
                   "heavy_mm": HEAVY_MM, "version": "v2"}, f, indent=2)
    print("artifacts: metrics_v2.json, champion_v2.pkl, linear_v2.json")


if __name__ == "__main__":
    main()
