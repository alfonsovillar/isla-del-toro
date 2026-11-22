"""Fase 0: observación de boyas (Copernicus Marine In Situ) frente a modelos Open-Meteo.

Dos preguntas distintas:
  A) Habilidad del modelo: modelo en el punto de la boya vs boya (error real del modelo).
  B) Representatividad: modelo en el Toro vs boya (cuánto se parece la boya al Toro, sin validar nada).

Requiere ficheros en data/raw/insitu (bajados con copernicusmarine get, dataset_part=latest).
Uso: .venv/Scripts/python ingest/buoys_compare.py
Salida: data/phase0/buoys.json y tabla por pantalla.
"""
from __future__ import annotations

import glob
import json
import math
import statistics as st
import sys
from pathlib import Path

import numpy as np
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import openmeteo as om  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "insitu"
MS_TO_KN = 1.943844

BUOYS = {
    "6100430": {"name": "Dragonera (Puertos del Estado)", "pattern": "*_TS_MO_6100430_*.nc"},
    "61499": {"name": "Bahía de Palma (SOCIB)", "pattern": "*_TS_MO_61499_*.nc"},
}


def km(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    return 2 * 6371 * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2)
                                          * math.sin(math.radians(d - b) / 2) ** 2))


def good(ds, var):
    """Valores con QC 1 (bueno) o 2 (probablemente bueno), capa más somera."""
    if var not in ds:
        return None
    v = ds[var]
    qc = ds.get(var + "_QC")
    if qc is not None:
        v = v.where(qc.isin([1, 2]))
    if "DEPTH" in v.dims:
        # primera capa con datos (la más somera)
        for i in range(v.sizes["DEPTH"]):
            s = v.isel(DEPTH=i)
            if int(s.notnull().sum()) > 0:
                return s
        return None
    return v


def load_buoy(code, pattern):
    files = sorted(glob.glob(str(RAW / "**" / pattern), recursive=True))
    series = {"wind_kn": {}, "wdir": {}, "hs": {}, "sst": {}}
    lat = lon = None
    for f in files:
        ds = xr.open_dataset(f)
        lat = float(np.nanmean(ds["LATITUDE"].values))
        lon = float(np.nanmean(ds["LONGITUDE"].values))
        for key, var, k in (("wind_kn", "WSPD", MS_TO_KN), ("wdir", "WDIR", 1), ("hs", "VHM0", 1), ("sst", "TEMP", 1)):
            s = good(ds, var)
            if s is None:
                continue
            df = s.to_series().dropna()
            for t, val in df.items():
                hour = t.floor("h").strftime("%Y-%m-%dT%H:00Z") if hasattr(t, "floor") else None
                if hour:
                    series[key].setdefault(hour, []).append(float(val) * k)
        ds.close()
    def circ(v):  # media circular para direcciones (359° y 1° dan 0°, no 180°)
        s = sum(math.sin(math.radians(x)) for x in v)
        c = sum(math.cos(math.radians(x)) for x in v)
        return math.degrees(math.atan2(s, c)) % 360

    hourly = {key: {h: (circ(v) if key == "wdir" else st.mean(v)) for h, v in d.items()} for key, d in series.items()}
    return lat, lon, hourly, len(files)


def model_point(lat, lon, past_days=30):
    w, wg = om.fetch(om.WEATHER_URL, om.WEATHER_MODELS, ["wind_speed_10m", "wind_direction_10m"],
                     past_days, 1, {"wind_speed_unit": "kn"}, lat=lat, lon=lon)
    m, mg = om.fetch(om.MARINE_URL, om.MARINE_MODELS, ["wave_height", "sea_surface_temperature"],
                     past_days, 1, {}, lat=lat, lon=lon)
    return w, m, wg, mg


def stats(obs, mod):
    common = sorted(set(obs) & set(mod))
    if len(common) < 24:
        return None
    d = [mod[t] - obs[t] for t in common]
    o = [obs[t] for t in common]
    p = [mod[t] for t in common]
    r = float(np.corrcoef(o, p)[0, 1]) if len(set(o)) > 1 and len(set(p)) > 1 else float("nan")
    return {"n": len(common), "bias": st.mean(d), "mae": st.mean(abs(x) for x in d),
            "rmse": math.sqrt(st.mean(x * x for x in d)), "r": r, "obs_mean": st.mean(o)}


def model_series(hours, model, var):
    return {t: h[model][var] for t, h in hours.items() if model in h and var in h[model]}


def main():
    toro = json.loads((ROOT / "data" / "phase0" / "openmeteo.json").read_text(encoding="utf-8"))
    toro_w = {t: h["weather"] for t, h in toro["hours"].items()}
    toro_m = {t: h["marine"] for t, h in toro["hours"].items()}
    out = {"meta": {"source": "Copernicus Marine Service In Situ TAC (INSITU_MED_PHYBGCWAV_DISCRETE_MYNRT_013_035) "
                              "y Open-Meteo (CC BY 4.0)", "units": {"wind": "kn", "hs": "m", "sst": "°C"}},
           "buoys": {}}
    checks = (("wind_kn", "weather", "wind_speed_10m", om.WEATHER_MODELS, "Viento (kn)"),
              ("hs", "marine", "wave_height", om.MARINE_MODELS, "Altura de ola Hs (m)"),
              ("sst", "marine", "sea_surface_temperature", om.MARINE_MODELS, "Temperatura del agua (°C)"))
    for code, b in BUOYS.items():
        lat, lon, obs, nfiles = load_buoy(code, b["pattern"])
        if lat is None:
            print(f"\n## {b['name']}: sin ficheros")
            continue
        dist = km(om.LAT, om.LON, lat, lon)
        print(f"\n## {b['name']} [{code}] {lat:.3f} N {lon:.3f} E, a {dist:.1f} km del Toro, {nfiles} ficheros")
        for key in obs:
            if obs[key]:
                ts = sorted(obs[key])
                print(f"   obs {key:8} n={len(ts):4} {ts[0][:13]}..{ts[-1][:13]} media={st.mean(obs[key].values()):.2f}")
        w, m, _, _ = model_point(lat, lon)
        latest = {key: {"time": max(v), "value": round(v[max(v)], 2)} for key, v in obs.items() if v}
        res = {"name": b["name"], "lat": lat, "lon": lon, "km_to_toro": dist, "latest": latest,
               "skill": {}, "toro_vs_buoy": {}}
        for key, kind, var, models, label in checks:
            if not obs[key]:
                continue
            print(f"   {label}")
            print(f"     {'modelo':28} {'A: modelo en la boya':>34} | {'B: modelo en el Toro':>22}")
            for mdl in models:
                at_buoy = model_series(w if kind == "weather" else m, mdl, var)
                at_toro = model_series(toro_w if kind == "weather" else toro_m, mdl, var)
                a = stats(obs[key], at_buoy)
                bt = stats(obs[key], at_toro)
                res["skill"].setdefault(key, {})[mdl] = a
                res["toro_vs_buoy"].setdefault(key, {})[mdl] = bt
                fa = f"n={a['n']:3} sesgo={a['bias']:+5.2f} MAE={a['mae']:4.2f} r={a['r']:.2f}" if a else "sin datos"
                fb = f"sesgo={bt['bias']:+5.2f} r={bt['r']:.2f}" if bt else "sin datos"
                print(f"     {mdl:28} {fa:>34} | {fb:>22}")
        out["buoys"][code] = res
    p = ROOT / "data" / "phase0" / "buoys.json"
    if not out["buoys"]:
        # Sin ficheros de boyas (descarga fallida): se conserva el último buoys.json bueno.
        raise SystemExit("Sin datos de boyas; no se sobrescribe buoys.json")
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nOK {p.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
