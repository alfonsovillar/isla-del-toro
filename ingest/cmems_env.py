"""Carga .env.local (en local) en os.environ sin imprimir nada; en CI usa los secretos ya presentes. Importar antes de usar copernicusmarine."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_env() -> None:
    p = ROOT / ".env.local"
    # En GitHub Actions no hay .env.local: las credenciales llegan como secretos en variables de entorno.
    lines = p.read_text(encoding="utf-8").splitlines() if p.exists() else []
    if not lines and not os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME"):
        raise SystemExit("Faltan credenciales de Copernicus (.env.local o variables de entorno)")
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
        os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
    except ImportError:
        pass


load_env()
