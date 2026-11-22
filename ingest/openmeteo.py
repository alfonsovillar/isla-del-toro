"""Fase 0: baja N días pasados + previsión de Open-Meteo para el Toro, todos los modelos.

Salida: data/phase0/openmeteo.json  ->  {"meta": {...}, "hours": {iso_time: {modelo: {variable: valor}}}}
Solo stdlib. Licencia de los datos: Open-Meteo, CC BY 4.0.
Uso: python ingest/openmeteo.py [--past-days 30] [--forecast-days 3]
"""
from __future__ import annotations

import argparse
import json
import ssl
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LAT, LON = 39.462, 2.472  # Illa del Toro (ficha PADI)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "phase0" / "openmeteo.json"

try:  # el almacén de Windows de este PC da "certificate has expired"; certifi sí valida
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

WEATHER_MODELS = {
    "best_match": "Best Match",
    "gfs_seamless": "GFS (NOAA)",
    "icon_eu": "ICON-EU (DWD)",
    "ecmwf_ifs025": "ECMWF IFS 0.25",
    "meteofrance_arome_france": "AROME France 2.5 km",
    "meteofrance_arome_france_hd": "AROME France HD 1.3 km",
}
WEATHER_VARS = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
                "temperature_2m", "cloud_cover", "precipitation"]

MARINE_MODELS = {
    "best_match": "Best Match",
    "ecmwf_wam025": "ECMWF WAM",
    "meteofrance_wave": "Météo-France MFWAM",
    "ncep_gfswave025": "NCEP GFS Wave",
    "dwd_ewam": "DWD EWAM",
}
MARINE_VARS = ["wave_height", "wave_direction", "wave_period",
               "swell_wave_height", "swell_wave_direction", "swell_wave_period",
               "wind_wave_height", "sea_surface_temperature"]


def get(url: str, params: dict) -> dict:
    q = urllib.parse.urlencode(params, safe=",")
    req = urllib.request.Request(f"{url}?{q}", headers={"User-Agent": "isla-del-toro-phase0/0.1"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
                return json.load(r)
        except Exception:  # noqa: BLE001 - reintento simple
            if attempt == 2:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def fetch(url, models, variables, past_days, forecast_days, extra, lat=LAT, lon=LON):
    hours: dict[str, dict] = {}
    grid: dict[str, dict] = {}
    for model in models:
        d = get(url, {"latitude": lat, "longitude": lon, "hourly": ",".join(variables),
                      "models": model, "past_days": past_days, "forecast_days": forecast_days,
                      "timezone": "UTC", "timeformat": "iso8601", **extra})
        h = d["hourly"]
        grid[model] = {"lat": d["latitude"], "lon": d["longitude"], "elevation": d.get("elevation")}
        for i, t in enumerate(h["time"]):
            vals = {v: h[v][i] for v in variables if v in h and h[v][i] is not None}
            if vals:
                hours.setdefault(t + "Z", {})[model] = vals
    return hours, grid


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--past-days", type=int, default=30)
    ap.add_argument("--forecast-days", type=int, default=3)
    a = ap.parse_args()

    w_hours, w_grid = fetch(WEATHER_URL, WEATHER_MODELS, WEATHER_VARS, a.past_days,
                            a.forecast_days, {"wind_speed_unit": "kn"})
    m_hours, m_grid = fetch(MARINE_URL, MARINE_MODELS, MARINE_VARS, a.past_days,
                            a.forecast_days, {})

    dd = get(WEATHER_URL, {"latitude": LAT, "longitude": LON, "daily": "sunrise,sunset",
                           "past_days": 1, "forecast_days": a.forecast_days, "timezone": "Europe/Madrid"})["daily"]
    daily = {t: {"sunrise": sr, "sunset": ss} for t, sr, ss in zip(dd["time"], dd["sunrise"], dd["sunset"])}

    hours: dict[str, dict] = {}
    for t in sorted(set(w_hours) | set(m_hours)):
        hours[t] = {"weather": w_hours.get(t, {}), "marine": m_hours.get(t, {})}

    out = {
        "meta": {
            "point": {"lat": LAT, "lon": LON, "name": "Illa del Toro"},
            "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "past_days": a.past_days, "forecast_days": a.forecast_days,
            "units": {"wind": "kn", "wave_height": "m", "period": "s", "sst": "°C", "temp": "°C"},
            "weather_models": WEATHER_MODELS, "marine_models": MARINE_MODELS,
            "grid_cells": {"weather": w_grid, "marine": m_grid},
            "source": "Open-Meteo (CC BY 4.0) https://open-meteo.com",
            "label": "ESTIMADO (modelo)",
        },
        "daily_local": daily,
        "hours": hours,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"OK {OUT.relative_to(ROOT)}: {len(hours)} horas")


if __name__ == "__main__":
    main()
