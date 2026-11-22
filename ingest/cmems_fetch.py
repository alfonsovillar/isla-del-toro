"""Fase 0: Copernicus Marine para el Toro. Perfil térmico MEDSEA y transparencia KD490.

Credenciales en .env.local (cmems_env). Salida: data/phase0/cmems.json
Uso: .venv/Scripts/python ingest/cmems_fetch.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cmems_env  # noqa: E402,F401  carga credenciales
import copernicusmarine as cm  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmems"
LAT, LON = 39.4623, 2.4717
BOX = 0.02  # ~2 km alrededor del islote para la mediana de KD490

THETAO = "cmems_mod_med_phy-tem_anfc_4.2km_P1D-m"
CUR = "cmems_mod_med_phy-cur_anfc_4.2km-3D_PT1H-m"
KD = {"olci_300m": "cmems_obs-oc_med_bgc-transp_nrt_l3-olci-300m_P1D",
      "multi_1km": "cmems_obs-oc_med_bgc-transp_nrt_l3-multi-1km_P1D"}


def subset(dataset_id, var, fn, start, end, depth=None):
    return subset_vars(dataset_id, [var], fn, start, end, depth)


def subset_vars(dataset_id, variables, fn, start, end, depth=None):
    kw = dict(dataset_id=dataset_id, variables=variables, minimum_longitude=LON - 0.07, maximum_longitude=LON + 0.08,
              minimum_latitude=LAT - 0.06, maximum_latitude=LAT + 0.06, start_datetime=start, end_datetime=end,
              output_directory=str(RAW), output_filename=fn, overwrite=True, disable_progress_bar=True)
    if depth:
        kw.update(minimum_depth=0, maximum_depth=depth)
    cm.subset(**kw)
    return xr.open_dataset(RAW / fn)


def main():
    now = datetime.now(timezone.utc)
    d = lambda n: (now + timedelta(days=n)).strftime("%Y-%m-%d")  # noqa: E731
    out = {"meta": {"generated_utc": now.isoformat(timespec="seconds"), "point": {"lat": LAT, "lon": LON},
                    "source": "E.U. Copernicus Marine Service Information",
                    "products": {"thetao": "MEDSEA_ANALYSISFORECAST_PHY_006_013 (" + THETAO + ")", "currents": CUR,
                                 "kd490": "OCEANCOLOUR_MED_BGC_L3_NRT_009_141"},
                    "label": "ESTIMADO (modelo y satélite)"}}

    t = subset(THETAO, "thetao", "medsea_thetao.nc", d(-7), d(5), depth=60).thetao
    p = t.sel(latitude=LAT, longitude=LON, method="nearest")
    out["thetao"] = {"cell": {"lat": float(p.latitude), "lon": float(p.longitude)},
                     "depth_m": [round(float(x), 1) for x in t.depth.values],
                     "days": {str(x)[:10]: [None if not np.isfinite(v) else round(float(v), 2) for v in p.sel(time=x).values]
                              for x in p.time.values}}

    # Corrientes horarias (uo hacia el este, vo hacia el norte, m/s) 0-30 m, de ayer a +2 días.
    now_h = now.strftime("%Y-%m-%dT%H:00:00")
    c = subset_vars(CUR, ["uo", "vo"], "medsea_cur.nc", (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:00:00"),
               (now + timedelta(hours=48)).strftime("%Y-%m-%dT%H:00:00"), depth=30)
    cv = xr.open_dataset(RAW / "medsea_cur.nc")
    cu = cv.uo.sel(latitude=LAT, longitude=LON, method="nearest")
    cvv = cv.vo.sel(latitude=LAT, longitude=LON, method="nearest")
    hours = {}
    for i, x in enumerate(cu.time.values):
        prof = []
        for k, z in enumerate(cv.depth.values):
            u, v = float(cu.values[i, k]), float(cvv.values[i, k])
            if np.isfinite(u) and np.isfinite(v):
                spd = (u * u + v * v) ** 0.5
                prof.append({"depth_m": round(float(z), 1), "speed_kn": round(spd * 1.943844, 2),
                             "to_deg": round((np.degrees(np.arctan2(u, v)) + 360) % 360)})
        hours[str(x)[:13] + ":00Z"] = prof
    out["currents"] = {"cell": {"lat": float(cu.latitude), "lon": float(cu.longitude)},
                       "convention": "to_deg: hacia dónde va la corriente", "hours": hours}
    del c, now_h

    out["kd490"] = {}
    for key, ds_id in KD.items():
        k = subset(ds_id, "KD490", f"kd490_{key}.nc", d(-45), d(0)).KD490
        lat_sl = slice(LAT + BOX, LAT - BOX) if k.latitude[0] > k.latitude[-1] else slice(LAT - BOX, LAT + BOX)
        box = k.sel(latitude=lat_sl, longitude=slice(LON - BOX * 1.3, LON + BOX * 1.3))
        days = {}
        for x in k.time.values:
            b = box.sel(time=x)
            n = int(b.notnull().sum())
            if n:
                med = float(b.median())
                days[str(x)[:10]] = {"kd490_median": round(med, 4), "pixels": n, "inv_kd_m": round(1 / med, 1)}
        out["kd490"][key] = days

    p = ROOT / "data" / "phase0" / "cmems.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    last = {k: max(v) if v else None for k, v in out["kd490"].items()}
    print(f"OK {p.relative_to(ROOT)}  celda MEDSEA {out['thetao']['cell']}  último KD490 válido {last}")


if __name__ == "__main__":
    main()
