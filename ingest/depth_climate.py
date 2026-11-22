"""Temperatura del agua por mes en superficie, 20 m y 40 m (reanálisis MEDSEA, 4,2 km).

Fuente: Copernicus MEDSEA_MULTIYEAR_PHY_006_004 (cmems_mod_med_phy-temp_my_4.2km_P1M-m).
Añade la clave "depth_clim" a data/phase0/history.json (ejecutar después de history.py).
Uso: .venv/Scripts/python ingest/depth_climate.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cmems_env  # noqa: E402,F401
import copernicusmarine as cm  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmems"
DS = "cmems_mod_med_phy-temp_my_4.2km_P1M-m"
LAT, LON = 39.4792, 2.4583  # celda de mar MEDSEA más próxima al islote (~2 km)
TARGET = [0, 20, 40]


def main():
    fn = "medsea_my_thetao_monthly.nc"
    cm.subset(dataset_id=DS, variables=["thetao"], minimum_longitude=LON - 0.02, maximum_longitude=LON + 0.02,
              minimum_latitude=LAT - 0.02, maximum_latitude=LAT + 0.02, minimum_depth=0, maximum_depth=45,
              output_directory=str(RAW), output_filename=fn, overwrite=True, disable_progress_bar=True)
    t = xr.open_dataset(RAW / fn).thetao.sel(latitude=LAT, longitude=LON, method="nearest")
    years = sorted({int(str(x)[:4]) for x in t.time.values})
    out = {"source": "E.U. Copernicus Marine Service Information (MEDSEA_MULTIYEAR_PHY_006_004)",
           "years": [years[0], years[-1]], "cell": {"lat": float(t.latitude), "lon": float(t.longitude)}, "depths": {}}
    for z in TARGET:
        s = t.sel(depth=z, method="nearest")
        real = round(float(s.depth), 1)
        months = []
        for m in range(1, 13):
            v = s.where(s.time.dt.month == m, drop=True).values
            v = v[np.isfinite(v)]
            months.append([round(float(v.mean()), 2), round(float(v.min()), 2), round(float(v.max()), 2)] if v.size else None)
        out["depths"][str(z)] = {"model_depth_m": real, "months": months}
    p = ROOT / "data" / "phase0" / "history.json"
    h = json.loads(p.read_text(encoding="utf-8"))
    h["depth_clim"] = out
    p.write_text(json.dumps(h, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("OK", out["years"], {z: [m[0] if m else None for m in d["months"]] for z, d in out["depths"].items()})


if __name__ == "__main__":
    main()
