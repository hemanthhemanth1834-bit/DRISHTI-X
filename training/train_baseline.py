#!/usr/bin/env python3
"""Genuine micro-baseline: 6h-ahead rainfall from ERA5 history (Vijayawada).

Pipeline (matches training/README.md):
  ingest (Open-Meteo ERA5 archive, free) -> clean -> align -> features ->
  time-ordered split -> persistence + Ridge baselines -> MAE/RMSE,
  heavy-event precision/recall/F1 -> versioned artifacts.

Usage:
  python training/train_baseline.py                # full run (~1-2 min)
  python training/train_baseline.py --no-fetch     # reuse data/raw CSV
"""
from __future__ import annotations
import argparse, csv, datetime as dt, json, math, os, urllib.request

RAW = os.path.join("data", "raw", "vijayawada_era5_2024monsoon.csv")
LAT, LON = 16.51, 81.78
START, END = "2024-06-01", "2024-09-30"
LAGS = [1, 2, 3, 6, 12, 24]
HORIZON = 6
HEAVY_MM = 5.0


def fetch_archive(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    url = ("https://archive-api.open-meteo.com/v1/era5?latitude=%s&longitude=%s"
           "&start_date=%s&end_date=%s&hourly=precipitation&timezone=UTC") % (LAT, LON, START, END)
    req = urllib.request.Request(url, headers={"User-Agent": "DRISHTI-X-PS26071 training"})
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "w", newline="") as f:
        j = json.load(r)
        t, p = j["hourly"]["time"], j["hourly"]["precipitation"]
        w = csv.writer(f)
        w.writerow(["time_utc", "precip_mm"])
        for ti, pi in zip(t, p):
            w.writerow([ti, "" if pi is None else pi])
    print("ingested %d hourly rows -> %s" % (len(t), path))


def load_rows(path: str):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    return [(r["time_utc"], float(r["precip_mm"]) if r["precip_mm"] != "" else None) for r in rows]


def build_frame(rows):
    vals = [v if v is not None else 0.0 for _, v in rows]  # documented: gaps->0 with count feature
    gaps = [0 if v is not None else 1 for _, v in rows]
    X, y, meta = [], [], []
    for i in range(max(LAGS), len(vals) - HORIZON):
        feats = [vals[i - l] for l in LAGS]
        feats.append(sum(vals[i - 24:i]))
        feats.append(sum(gaps[i - 24:i]))
        hod = (i % 24) / 24 * 2 * math.pi
        feats += [math.sin(hod), math.cos(hod)]
        X.append(feats)
        y.append(vals[i + HORIZON])
        meta.append(rows[i][0])
    return X, y, meta


def mean(xs):
    return sum(xs) / len(xs)


def mae(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def rmse(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)) / len(a))


def prf(y_true, y_pred, thr=HEAVY_MM):
    tp = sum(1 for a, b in zip(y_true, y_pred) if a >= thr and b >= thr)
    fp = sum(1 for a, b in zip(y_true, y_pred) if a < thr and b >= thr)
    fn = sum(1 for a, b in zip(y_true, y_pred) if a >= thr and b < thr)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {"precision": round(prec, 4), "recall": round(rec, 4), "F1": round(f1, 4),
            "events_true": sum(1 for a in y_true if a >= thr)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--ver", default="v1")
    a = ap.parse_args()
    if not a.no_fetch or not os.path.exists(RAW):
        fetch_archive(RAW)
    rows = load_rows(RAW)
    X, y, meta = build_frame(rows)
    n = len(X)
    i1, i2 = int(n * 0.7), int(n * 0.85)
    splits = {"train": (X[:i1], y[:i1], meta[:i1]), "validate": (X[i1:i2], y[i1:i2], meta[i1:i2]),
              "test": (X[i2:], y[i2:], meta[i2:])}
    print("rows=%d train=%d validate=%d test=%d (%s..%s)" % (n, i1, i2 - i1, n - i2, meta[0], meta[-1]))

    from sklearn.linear_model import Ridge
    model = Ridge(alpha=1.0)
    model.fit(splits["train"][0], splits["train"][1])

    results: dict = {"version": a.ver, "target": "precip t+6h (mm)",
                     "features": ["lag%d" % l for l in LAGS] + ["sum24", "gaps24", "hod_sin", "hod_cos"],
                     "train_period_utc": [meta[0], meta[i1 - 1]],
                     "test_period_utc": [meta[i2], meta[-1]], "models": {}}
    for name, fn in [("persistence", lambda Xx: [row[0] for row in Xx]),
                     ("ridge", lambda Xx: model.predict(Xx).tolist())]:
        m = {"regression": {}, "events": {}}
        for split, (Xs, ys, _) in splits.items():
            if split == "train" and name == "ridge":
                continue
            pred = [max(0.0, v) for v in fn(Xs)]
            m["regression"][split] = {"MAE_mm": round(mae(ys, pred), 4), "RMSE_mm": round(rmse(ys, pred), 4)}
            m["events"][split] = prf(ys, pred)
        results["models"][name] = m
        print(name, json.dumps(m))

    os.makedirs("models", exist_ok=True)
    import pickle
    with open("models/ridge_%s.pkl" % a.ver, "wb") as f:
        pickle.dump({"model": model, "lags": LAGS, "horizon": HORIZON}, f)
    with open("models/metrics_%s.json" % a.ver, "w") as f:
        json.dump(results, f, indent=2)
    with open("models/features_%s.json" % a.ver, "w") as f:
        json.dump({"features": results["features"], "units": "mm, hours, cyclic"}, f, indent=2)
    print("artifacts: models/ridge_%s.pkl, metrics_%s.json, features_%s.json" % (a.ver, a.ver, a.ver))


if __name__ == "__main__":
    main()
