"""Descarga los ficheros diarios recientes (parte "latest", ~30 días) de las boyas de referencia desde
Copernicus Marine In Situ (INSITU_MED_PHYBGCWAV_DISCRETE_MYNRT_013_035). Los lee luego buoys_compare.py.
Uso: .venv/Scripts/python ingest/buoys_fetch.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cmems_env  # noqa: E402,F401
import copernicusmarine as cm  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATASET = "cmems_obs-ins_med_phybgcwav_mynrt_na_irr"
CODES = ["6100430", "61499"]  # Dragonera (Puertos del Estado), Bahía de Palma (SOCIB)

for code in CODES:
    r = cm.get(dataset_id=DATASET, dataset_part="latest", filter=f"*_{code}_*", output_directory=str(ROOT / "data" / "raw" / "insitu"),
               skip_existing=True, disable_progress_bar=True)
    print(f"OK {code}: {len(r.files)} ficheros")
