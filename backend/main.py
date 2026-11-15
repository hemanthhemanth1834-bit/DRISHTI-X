from fastapi import FastAPI, Query
from .services import providers as P
from .services.risk import compute_risk

app = FastAPI(title="DRISHTI-X Data API", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "drishti-x-data-api"}


@app.get("/weather")
async def weather(latitude: float = 16.99, longitude: float = 81.78):
    return await P.fetch_weather(latitude, longitude)


@app.get("/nwp")
async def nwp(latitude: float = 16.99, longitude: float = 81.78):
    out = []
    for m in P.NWP_MODELS:
        arr = await P.fetch_model(latitude, longitude, m["id"])
        if arr is None:
            out.append({**m, "status": "OFFLINE"})
        else:
            v = arr[:48]
            out.append({**m, "windowH": len(v), "precipMM24": round(sum(v[:24]), 1),
                        "maxIntensityMMH": round(max(v, default=0), 1), "status": "LIVE"})
    return {"models": out}


@app.get("/radar")
async def radar():
    try:
        return {"status": "LIVE", **await P.fetch_radar()}
    except Exception as e:
        return {"status": "OFFLINE", "error": str(e)}


@app.get("/rainfall-risk")
async def rainfall_risk(latitude: float = 16.99, longitude: float = 81.78):
    wx = await P.fetch_weather(latitude, longitude)
    hourly = wx.get("hourly", {})
    hourly_p = hourly.get("precipitation", []) or []
    probs = hourly.get("precipitation_probability", []) or []
    cur = wx.get("current", {})

    def num(v):
        return v if isinstance(v, (int, float)) else None

    soil_arr = hourly.get("soil_moisture_3_9cm", []) or []
    risk = compute_risk({
        "rain_rate": num(cur.get("precipitation")),
        "accum6": sum(hourly_p[:6]), "accum24": sum(hourly_p[:24]),
        "antecedent24": 0.0, "nwp_mean": sum(hourly_p[:24]),
        "agreement": 0.5, "prob_max": max(probs[:24]) if probs[:24] else None,
        "humidity": num(cur.get("relative_humidity_2m")),
        "pressure": num(cur.get("pressure_msl")),
        "soil": soil_arr[0] if soil_arr and isinstance(soil_arr[0], (int, float)) else None,
        "elev": await P.fetch_elevation(latitude, longitude),
    })
    return {"label": "Transparent AI-assisted prototype (rule/weighted fusion, not a trained ML model)", "risk": risk}


@app.get("/inundation-risk")
async def inundation_risk(latitude: float = Query(16.99), longitude: float = Query(81.78)):
    r = await rainfall_risk(latitude, longitude)
    return {"inundation": r["risk"]["inundation"], "isEstimate": True,
            "note": "MODEL ESTIMATE from rainfall, soil moisture and elevation — not a surveyed flood depth."}


@app.get("/early-warning")
async def early_warning(latitude: float = 16.99, longitude: float = 81.78):
    r = await rainfall_risk(latitude, longitude)
    return {"level": r["risk"]["level"], "score": r["risk"]["score"],
            "drivers": r["risk"]["drivers"],
            "disclaimer": "AI-assisted analysis. Not an official IMD warning."}


@app.get("/data-health")
async def data_health():
    import time
    out = []
    for name, fn in [("Open-Meteo", lambda: P.fetch_weather(16.5, 80.6)),
                     ("RainViewer", P.fetch_radar)]:
        try:
            await fn()
            out.append({"name": name, "status": "LIVE"})
        except Exception:
            out.append({"name": name, "status": "OFFLINE"})
        time.sleep(0)
    return {"sources": out}
