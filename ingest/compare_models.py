"""Fase 0: resumen de cobertura y dispersión entre modelos a partir de data/phase0/openmeteo.json.

Sin observación de viento accesible todavía (boyas vía Copernicus In Situ pendientes de credenciales),
compara cada modelo contra la mediana del resto. Uso: python ingest/compare_models.py
"""
from __future__ import annotations

import json
import math
import statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
d = json.loads((ROOT / "data" / "phase0" / "openmeteo.json").read_text(encoding="utf-8"))
hours = d["hours"]
meta = d["meta"]


def haversine_km(a, b, c, e):
    r = 6371
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = p2 - p1, math.radians(e - b)
    return 2 * r * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


P = meta["point"]
print("== Celda de cada modelo (distancia al Toro)")
for kind in ("weather", "marine"):
    for m, g in meta["grid_cells"][kind].items():
        km = haversine_km(P["lat"], P["lon"], g["lat"], g["lon"])
        print(f"  {kind:7} {m:28} {g['lat']:.3f},{g['lon']:.3f}  {km:5.1f} km")


def series(kind, var):
    out = {}
    for t, h in hours.items():
        for m, vals in h[kind].items():
            if var in vals:
                out.setdefault(m, {})[t] = vals[var]
    return out


def report(kind, var, unit):
    s = series(kind, var)
    print(f"\n== {var} ({unit}): cobertura y sesgo frente a la mediana del resto")
    for m, ser in s.items():
        diffs = []
        for t, v in ser.items():
            others = [s[o][t] for o in s if o != m and t in s[o]]
            if len(others) >= 2:
                diffs.append(v - st.median(others))
        bias = st.mean(diffs) if diffs else float("nan")
        mae = st.mean(abs(x) for x in diffs) if diffs else float("nan")
        ts = sorted(ser)
        print(f"  {m:28} n={len(ser):4}  {ts[0][:13]}..{ts[-1][:13]}  sesgo={bias:+.2f}  MAE={mae:.2f}")


report("weather", "wind_speed_10m", "kn")
report("marine", "wave_height", "m")
sst = series("marine", "sea_surface_temperature")
for m, ser in sst.items():
    v = list(ser.values())
    print(f"\n== SST {m}: n={len(v)} media={st.mean(v):.2f} °C min={min(v):.2f} max={max(v):.2f}")
