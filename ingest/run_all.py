"""Ingesta completa y publicación de datos para la web.

Orden: Open-Meteo (horario) → Copernicus (perfil, corriente, KD490) → descarga y lectura de boyas → histórico (diario).
Al final copia los JSON a site/public/data/, que es lo que lee la web.
Uso:
  .venv/Scripts/python ingest/run_all.py            # todo
  .venv/Scripts/python ingest/run_all.py --hourly   # solo lo que cambia cada hora (sin histórico)
  .venv/Scripts/python ingest/run_all.py --publish  # solo copiar los JSON ya generados
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "phase0"
DST = ROOT / "site" / "public" / "data"
FILES = ["openmeteo.json", "cmems.json", "buoys.json", "history.json"]
HOURLY = ["openmeteo.py", "cmems_fetch.py", "buoys_fetch.py", "buoys_compare.py"]
DAILY = ["history.py", "depth_climate.py"]


def run(script: str) -> bool:
    print(f"→ {script}", flush=True)
    r = subprocess.run([sys.executable, str(ROOT / "ingest" / script)], cwd=ROOT)
    if r.returncode:
        print(f"  ERROR en {script} (código {r.returncode}); se publica lo último bueno", flush=True)
    return r.returncode == 0


def publish() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    status = {"published_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "files": {}}
    for f in FILES:
        p = SRC / f
        if p.exists():
            shutil.copy2(p, DST / f)
            status["files"][f] = datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")
    (DST / "status.json").write_text(json.dumps(status, indent=1), encoding="utf-8")
    print(f"OK publicado en {DST.relative_to(ROOT)}: {', '.join(status['files'])}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hourly", action="store_true")
    ap.add_argument("--publish", action="store_true")
    a = ap.parse_args()
    if not a.publish:
        for s in HOURLY + ([] if a.hourly else DAILY):
            run(s)
    publish()


if __name__ == "__main__":
    main()
