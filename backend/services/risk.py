"""Transparent risk prototype — mirrors lib/engine.ts (rule/weighted fusion)."""
from __future__ import annotations


def clamp01(v: float) -> float:
    return min(1.0, max(0.0, v))


def level_for(score: float) -> str:
    if score >= 80:
        return "EXTREME"
    if score >= 60:
        return "SEVERE"
    if score >= 40:
        return "ALERT"
    if score >= 20:
        return "WATCH"
    return "NORMAL"


def compute_risk(p: dict) -> dict:
    ok = {k: p.get(k) is not None for k in ("rain_rate", "prob_max", "soil", "humidity", "pressure")}
    missing_w = (0 if ok["rain_rate"] else 25) + (0 if ok["prob_max"] else 10) + (0 if ok["soil"] else 7) + \
        (0 if ok["humidity"] else 6) + (0 if ok["pressure"] else 5)
    scale = 1.0 if missing_w >= 100 else 100.0 / (100.0 - missing_w)
    n = {
        "intensity": clamp01(p["rain_rate"] / 25) if ok["rain_rate"] else 0.0,
        "a6": clamp01(p["accum6"] / 60),
        "a24": clamp01(p["accum24"] / 120),
        "nwp": clamp01(p["nwp_mean"] / 80) * (0.35 + 0.65 * p["agreement"]),
        "prob": clamp01(p["prob_max"] / 100) if ok["prob_max"] else 0.0,
        "soil": clamp01((p["soil"] - 0.12) / 0.3) if ok["soil"] else 0.0,
        "hum": clamp01((p["humidity"] - 55) / 45) if ok["humidity"] else 0.0,
        "pres": clamp01((1013 - p["pressure"]) / 18) if ok["pressure"] else 0.0,
    }
    raw = [("Rainfall intensity", 25, n["intensity"], ok["rain_rate"]),
           ("6-hour accumulation", 20, n["a6"], True),
           ("24-hour accumulation", 15, n["a24"], True),
           ("NWP consensus", 12, n["nwp"], True),
           ("Precipitation probability", 10, n["prob"], ok["prob_max"]),
           ("Soil moisture", 7, n["soil"], ok["soil"]),
           ("Humidity", 6, n["hum"], ok["humidity"]),
           ("Pressure anomaly", 5, n["pres"], ok["pressure"])]
    contribs = [{"feature": f, "weight": w, "effectiveWeight": round(w * scale, 1) if a else 0,
                 "points": round(w * scale * v, 1) if a else 0, "available": a} for f, w, v, a in raw]
    score = round(sum(c["points"] for c in contribs))
    elev = p.get("elev")
    elev_f = 0.5 if elev is None else clamp01((120 - elev) / 120)
    inund = round(0.42 * n["a24"] + 0.22 * n["intensity"] + 0.14 * n["soil"]
                  + 0.12 * clamp01(p["antecedent24"] / 80) + 0.10 * elev_f, 2)
    cls = "SEVERE" if inund >= 0.65 else "HIGH" if inund >= 0.45 else "MODERATE" if inund >= 0.25 else "LOW"
    drivers = [c["feature"] for c in sorted(contribs, key=lambda c: c["points"], reverse=True)[:4]]
    return {"score": score, "level": level_for(score), "contributions": contribs, "drivers": drivers,
            "renormalized": missing_w > 0, "scale": round(scale, 3),
            "inundation": {"prob01": inund, "class": cls, "isEstimate": True}}
