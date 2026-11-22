"""Histórico del Toro: temperatura del agua (satélite) y viento/ola (reanálisis).

- SST: Copernicus SST_MED_SST_L4_REP_OBSERVATIONS_010_021 (1981 hasta ~1 año atrás) +
  SST_MED_SST_L4_NRT_OBSERVATIONS_010_004 (reciente). Climatología diaria 1991-2020 (media, p10, p90).
- Viento y ola: Open-Meteo archivo ERA5 y marine API, máximos diarios desde 2016.
Salida: data/phase0/history.json   Uso: .venv/Scripts/python ingest/history.py
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cmems_env  # noqa: E402,F401
import copernicusmarine as cm  # noqa: E402
import openmeteo as om  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cmems"
LAT, LON = 39.4623, 2.4717
# Celda de mar al O del islote: el píxel del propio islote puede venir enmascarado como tierra.
SST_LAT, SST_LON = 39.4625, 2.4600
REP = "cmems_SST_MED_SST_L4_REP_OBSERVATIONS_010_021"
NRT = "SST_MED_SST_L4_NRT_OBSERVATIONS_010_004_a_V2"


def sst_series(dataset_id, start, end, fn):
    cm.subset(dataset_id=dataset_id, variables=["analysed_sst"], minimum_longitude=SST_LON - 0.03,
              maximum_longitude=SST_LON + 0.03, minimum_latitude=SST_LAT - 0.03, maximum_latitude=SST_LAT + 0.03,
              start_datetime=start, end_datetime=end, output_directory=str(RAW), output_filename=fn,
              overwrite=True, disable_progress_bar=True)
    ds = xr.open_dataset(RAW / fn)
    v = ds.analysed_sst
    # mediana de las celdas de mar de la caja (~3 km), en °C
    s = v.median(dim=[d for d in v.dims if d != "time"], skipna=True) - 273.15
    return {str(t)[:10]: round(float(x), 2) for t, x in zip(s.time.values, s.values) if np.isfinite(x)}


def main():
    today = date.today()
    rep = sst_series(REP, "1981-09-01", today.isoformat(), "sst_rep_toro.nc")
    rep_end = max(rep)
    nrt = sst_series(NRT, (date.fromisoformat(rep_end) + timedelta(days=1)).isoformat(), today.isoformat(), "sst_nrt_toro.nc")
    sst = {**rep, **nrt}

    clim = {}
    for doy in range(1, 367):
        vals = [v for k, v in rep.items() if 1991 <= int(k[:4]) <= 2020 and date.fromisoformat(k).timetuple().tm_yday == doy]
        if vals:
            clim[doy] = [round(float(np.mean(vals)), 2), round(float(np.percentile(vals, 10)), 2), round(float(np.percentile(vals, 90)), 2)]

    start = "2016-01-01"
    end = (today - timedelta(days=6)).isoformat()  # ERA5 llega con ~5 días de retraso
    w = om.get("https://archive-api.open-meteo.com/v1/archive", {"latitude": LAT, "longitude": LON,
               "daily": "wind_speed_10m_max,wind_gusts_10m_max", "start_date": start, "end_date": end,
               "wind_speed_unit": "kn", "timezone": "Europe/Madrid", "models": "era5"})["daily"]
    m = om.get(om.MARINE_URL, {"latitude": LAT, "longitude": LON, "daily": "wave_height_max",
               "start_date": start, "end_date": end, "timezone": "Europe/Madrid"})["daily"]
    daily = {}
    for t, ws, gs in zip(w["time"], w["wind_speed_10m_max"], w["wind_gusts_10m_max"]):
        daily[t] = {"wind_max": ws, "gust_max": gs}
    for t, hs in zip(m["time"], m["wave_height_max"]):
        daily.setdefault(t, {})["wave_max"] = hs

    out = {"meta": {"generated": today.isoformat(),
                    "sst_source": "E.U. Copernicus Marine Service Information (" + REP + ", " + NRT + ")",
                    "wind_source": "Open-Meteo, ERA5 (Copernicus Climate Change Service)", "rep_end": rep_end,
                    "clim_period": "1991-2020", "units": {"sst": "°C", "wind": "kn", "wave": "m"}},
           "sst": sst, "sst_clim_doy": clim, "daily": daily}
    p = ROOT / "data" / "phase0" / "history.json"
    p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"OK {p.relative_to(ROOT)}: SST {min(sst)}..{max(sst)} ({len(sst)} días), REP hasta {rep_end}; "
          f"viento/ola {len(daily)} días; {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
