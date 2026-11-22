# Illa del Toro · parte de buceo

Web informativa y gratuita con las condiciones para bucear en la Illa del Toro (Calvià, Mallorca): viento y oleaje de varios modelos, temperatura del agua por profundidad, corriente, transparencia por satélite, boyas reales, cámara submarina, satélite de nubes y rayos, e histórico de la zona. En catalán, castellano, inglés y alemán.

La web muestra datos; no recomienda cara ni boya. Todo son estimaciones de modelos y satélite, salvo las boyas.

## Estructura

- `site/`: la web (Astro). Textos de los cuatro idiomas en `site/src/i18n/ui.js`.
- `ingest/`: scripts de Python que descargan los datos. `ingest/run_all.py` lo ejecuta todo y deja los JSON en `site/public/data/`.
- `data/phase0/`: última copia de los datos procesados.
- `.github/workflows/actualizar.yml`: cada hora descarga los datos, compila la web y la publica en GitHub Pages.

## En local

```
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # en Linux o macOS: .venv/bin/pip
.venv/Scripts/python ingest/run_all.py --hourly
cd site && npm install && npm run dev
```

Las credenciales de Copernicus Marine van en `.env.local` (no se sube) o en las variables `COPERNICUSMARINE_SERVICE_USERNAME` y `COPERNICUSMARINE_SERVICE_PASSWORD`.

## Fuentes

Ortofoto PNOA © IGN · Open-Meteo (CC BY 4.0) · Generated using E.U. Copernicus Marine Service Information · Puertos del Estado · SOCIB · © EUMETSAT · Windy · Windguru · Ajuntament de Calvià · NASA GIBS. Windy y Windguru solo se incrustan con sus widgets oficiales; no se descarga ningún dato suyo.
