"""Free-data fetchers: Open-Meteo weather + NWP, RainViewer radar, NASA GIBS."""
import httpx

UA = {"User-Agent": "DRISHTI-X-PS26071 research demo (SIH)"}
TIMEOUT = 15.0

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
RAINVIEWER_URL = "https://api.rainviewer.com/public/weather-maps.json"
GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"

NWP_MODELS = [
    {"id": "ecmwf_ifs04", "label": "ECMWF IFS", "resolution": "Open IFS 0.4° (~45 km)"},
    {"id": "gfs_seamless", "label": "GFS", "resolution": "NOAA seamless (~13–25 km)"},
    {"id": "icon_seamless", "label": "ICON", "resolution": "DWD seamless (~13 km)"},
    {"id": "gem_seamless", "label": "GEM", "resolution": "ECCC seamless (~15–25 km)"},
]


async def fetch_weather(lat: float, lon: float) -> dict:
    params = {
        "latitude": lat, "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m",
        "hourly": "precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,wind_speed_10m,soil_moisture_3_9cm",
        "daily": "precipitation_sum,precipitation_probability_max",
        "timezone": "auto", "forecast_days": 3, "past_days": 1,
    }
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA) as c:
        r = await c.get(FORECAST_URL, params=params)
        r.raise_for_status()
        return r.json()


async def fetch_model(lat: float, lon: float, model_id: str) -> list[float] | None:
    try:
        params = {"latitude": lat, "longitude": lon, "hourly": "precipitation",
                  "models": model_id, "timezone": "auto", "forecast_days": 2}
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA) as c:
            r = await c.get(FORECAST_URL, params=params)
            r.raise_for_status()
            arr = r.json().get("hourly", {}).get("precipitation")
            return arr if isinstance(arr, list) else None
    except Exception:
        return None


async def fetch_radar() -> dict:
    async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA) as c:
        r = await c.get(RAINVIEWER_URL)
        r.raise_for_status()
        return r.json()


async def fetch_elevation(lat: float, lon: float) -> float | None:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=UA) as c:
            r = await c.get(ELEVATION_URL, params={"latitude": lat, "longitude": lon})
            r.raise_for_status()
            e = r.json().get("elevation", [None])[0]
            return e if isinstance(e, (int, float)) else None
    except Exception:
        return None
