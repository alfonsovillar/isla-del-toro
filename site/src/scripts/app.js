// Cliente de la web: lee los JSON de /data y pinta cada bloque en el idioma de la página.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const T = JSON.parse(document.getElementById("i18n").textContent);
const LOC = T.locale;
const t = (k, v = {}) => String(T[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? ""));
const $ = (id) => document.getElementById(id);
const DATA = (T.base || "/") + "data/";
// La hora en la URL evita la caché de GitHub Pages (10 min): cada hora se piden los datos nuevos.
const getJSON = (name) => fetch(`${DATA}${name}?h=${new Date().toISOString().slice(0, 13)}`).then((r) => r.json());
const TZ = "Europe/Madrid";

const TORO = [2.4717, 39.4623]; // centro del islote (OpenStreetMap)
const HOME = { center: [2.4719, 39.4627], bearing: 0, pitch: 0 };
const CAMERA = [2.4720, 39.4625]; // aproximada: "islote del Toro, 4-5 m"
const isMobile = matchMedia("(max-width: 900px)").matches;
const ZOOM = isMobile ? 15.4 : 15.8;

const card = (d) => T.dirs[Math.round(d / 22.5) % 16];
const tzHour = (iso) => new Date(iso).toLocaleTimeString(LOC, { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const num = (v, d = 1) => v.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v, d = 1) => (v >= 0 ? "+" : "−") + num(Math.abs(v), d);
const hourKey = () => { const n = new Date(); n.setUTCMinutes(0, 0, 0); return n.toISOString().slice(0, 13) + ":00Z"; };
const MES = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2001, i, 15)).toLocaleDateString(LOC, { month: "short", timeZone: "UTC" }).replace(".", ""));

// Windy: cuatro embeds oficiales, uno por capa.
for (const f of document.querySelectorAll("#windy-tiles iframe"))
  f.src = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&metricWind=kt&zoom=9&overlay=${f.dataset.o}&product=ecmwf&level=surface&lat=39.40&lon=2.55&detailLat=39.462&detailLon=2.472&marker=true&message=true`;

// Mapa de situación: ortofoto PNOA del IGN.
const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: { pnoa: { type: "raster", tileSize: 256, maxzoom: 19,
    tiles: ["https://www.ign.es/wmts/pnoa-ma?service=WMTS&request=GetTile&version=1.0.0&format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}"],
    attribution: "Ortofoto PNOA © IGN" } }, layers: [{ id: "pnoa", type: "raster", source: "pnoa" }] },
  ...HOME, zoom: ZOOM, maxZoom: 19, minZoom: 8, cooperativeGestures: true,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
$("home").onclick = () => map.flyTo({ ...HOME, zoom: ZOOM, duration: 900 });
{
  const el = document.createElement("div"); el.className = "cam"; el.textContent = "▶";
  new maplibregl.Marker({ element: el }).setLngLat(CAMERA).setPopup(new maplibregl.Popup({ offset: 14 })
    .setHTML(`<b>${t("cam_popup")}</b><br>Ajuntament de Calvià, ~4-5 m<br><span class="est">${t("approx")}</span><br><a href="#cam" style="color:#7fd3ff">${t("cam_view")}</a>`)).addTo(map);
}
// Fecha del vuelo PNOA en el centro del islote (GetFeatureInfo del IGN).
fetch("https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&version=1.3.0&request=GetFeatureInfo&layers=OI.MosaicElement&query_layers=OI.MosaicElement&styles=&crs=EPSG:4326&bbox=39.46,2.47,39.465,2.475&width=101&height=101&i=50&j=50&info_format=text/html")
  .then((r) => r.text()).then((x) => {
    const m = x.match(/(\d{4})-(\d{2})/); if (!m) return;
    const when = new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleDateString(LOC, { month: "long", year: "numeric", timeZone: "UTC" });
    $("pnoa-date").textContent = t("pnoa_flight", { m: when });
  }).catch(() => {});

// Sol: amanecer, atardecer y luz que queda. Luna: fase calculada (luna nueva de referencia 6-ene-2000 18:14 UTC).
function sky(sunrise, sunset) {
  const toMin = (s) => +s.slice(-5, -3) * 60 + +s.slice(-2);
  const n = toMin(new Date().toLocaleTimeString("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })), a = toMin(sunrise), b = toMin(sunset);
  const hm = (m) => t("hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
  $("n-sun").textContent = `${sunrise.slice(11)} · ${sunset.slice(11)}`;
  $("n-sun-s").textContent = n < a ? t("sun_in", { t: hm(a - n) }) : n < b ? t("sun_left", { t: hm(b - n) }) : t("sun_night");
  const SYN = 29.530588853, age = (((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN + SYN) % SYN;
  const illum = (1 - Math.cos(2 * Math.PI * age / SYN)) / 2;
  const bounds = [1.85, 5.54, 9.23, 12.92, 16.61, 20.3, 23.99, 27.68, 99];
  const name = T.moon[bounds.findIndex((x) => age < x)], R = 10, waxing = age < SYN / 2, k = Math.cos(2 * Math.PI * age / SYN);
  const lit = `M 0 ${-R} A ${R} ${R} 0 0 ${waxing ? 1 : 0} 0 ${R} A ${Math.abs(k) * R} ${R} 0 0 ${(k > 0) === waxing ? 0 : 1} 0 ${-R} Z`;
  $("moon-ic").innerHTML = `<svg viewBox="-12 -12 24 24" role="img" aria-label="${name}"><circle r="${R}" fill="#22384b" stroke="#7fd3ff" stroke-width="1"/><path d="${lit}" fill="#e6eef5"/></svg>`;
  $("n-moon").textContent = name;
  $("n-moon-s").textContent = t("moon_lit", { p: Math.round(illum * 100) });
}

// Rosa: viento y mar de fondo entran desde el borde hacia el centro (de dónde vienen); la corriente sale del centro (hacia dónde va).
function rose(wind, swell, cur) {
  const R = 60, c = 75, rad = (a) => (a - 90) * Math.PI / 180, P = (a, r) => [c + r * Math.cos(rad(a)), c + r * Math.sin(rad(a))];
  const head = (x2, y2, ang, col) => { const a = rad(ang), s = 7;
    return `<path d="M${x2},${y2} L${x2 - s * Math.cos(a - .45)},${y2 - s * Math.sin(a - .45)} L${x2 - s * Math.cos(a + .45)},${y2 - s * Math.sin(a + .45)} Z" fill="${col}"/>`; };
  const inbound = (from, col, w, r0) => { if (from == null) return ""; const [x1, y1] = P(from, r0), [x2, y2] = P(from, 12);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>${head(x2, y2, from + 180, col)}`; };
  let g = `<circle cx="${c}" cy="${c}" r="${R}" fill="#0e1b27" stroke="#22384b"/><circle cx="${c}" cy="${c}" r="${R * .55}" fill="none" stroke="#22384b" stroke-dasharray="2 3"/>`;
  T.rose.forEach((l, i) => { const [x, y] = P(i * 90, R + 9); g += `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="#8aa0b3" font-size="11">${l}</text>`; });
  for (let a = 0; a < 360; a += 45) { const [x1, y1] = P(a, R - 4), [x2, y2] = P(a, R); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8aa0b3"/>`; }
  g += inbound(swell, "#9cf0b0", 5, R - 2) + inbound(wind, "#7fd3ff", 3, R - 2);
  if (cur != null) { const [x2, y2] = P(cur, R * .55); g += `<line x1="${c}" y1="${c}" x2="${x2}" y2="${y2}" stroke="#c9a0ff" stroke-width="3" stroke-linecap="round"/>${head(x2, y2, cur, "#c9a0ff")}`; }
  g += `<circle cx="${c}" cy="${c}" r="4" fill="#ff5a7a" stroke="#fff" stroke-width="1.5"/>`;
  $("rose").innerHTML = `<svg viewBox="0 0 150 150" width="100%" role="img" aria-label="${t("a_rose")}">${g}</svg>`;
}

const state = {};

getJSON("openmeteo.json").then((d) => {
  const key = hourKey(), keys = Object.keys(d.hours).sort();
  const hk = d.hours[key] ? key : keys.filter((k) => k <= key).pop(), h = d.hours[hk];
  const w = h.weather.meteofrance_arome_france_hd || h.weather.best_match;
  const m = h.marine.meteofrance_wave || h.marine.best_match;
  state.wind = w.wind_direction_10m; state.swell = m.swell_wave_direction;
  rose(state.wind, state.swell, state.cur);
  $("lg-wind").textContent = `${Math.round(w.wind_speed_10m)} kn ${card(w.wind_direction_10m)} · ${t("gusts")} ${Math.round(w.wind_gusts_10m)}`;
  $("lg-swell").textContent = `${num(m.swell_wave_height)} m ${card(m.swell_wave_direction)} · ${Math.round(m.swell_wave_period)} s`;
  $("n-wind").textContent = `${Math.round(w.wind_speed_10m)} kn ${card(w.wind_direction_10m)}`;
  $("n-wind-s").textContent = t("wind_s", { g: Math.round(w.wind_gusts_10m) });
  $("n-wave").textContent = `${num(m.wave_height)} m`;
  $("n-wave-s").textContent = t("wave_s", { p: Math.round(m.wave_period), d: card(m.wave_direction) });
  const sst = h.marine.best_match && h.marine.best_match.sea_surface_temperature;
  $("n-sst").textContent = sst != null ? `${num(sst)} °C` : "–";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ }), sun = d.daily_local && d.daily_local[today];
  if (sun) sky(sun.sunrise, sun.sunset);
  $("stamp").textContent = t("stamp", { h: tzHour(hk), u: tzHour(d.meta.generated_utc) });
  forecastTable(d, keys.filter((k) => k >= hk).slice(0, 48));
}).catch((e) => { $("stamp").textContent = `${t("no_data")} (${e.message})`; });

// Tabla horaria propia, cada 2 h; los colores siguen el valor, no son una recomendación.
function forecastTable(d, keys) {
  keys = keys.filter((k, i) => i % 2 === 0);
  const windCol = (v) => v < 5 ? "#16324a" : v < 10 ? "#1d5a7a" : v < 15 ? "#2a8a8a" : v < 20 ? "#b49a2a" : v < 25 ? "#c46a2a" : "#b8333a";
  const waveCol = (v) => v < .3 ? "#16324a" : v < .6 ? "#1d5a7a" : v < 1 ? "#2a8a8a" : v < 1.5 ? "#b49a2a" : v < 2 ? "#c46a2a" : "#b8333a";
  const arrow = (dir) => `<span style="display:inline-block;transform:rotate(${dir + 180}deg)">↑</span>`;
  const hhmm = (k) => new Date(k).toLocaleTimeString("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const isNight = (k) => { const s = d.daily_local && d.daily_local[new Date(k).toLocaleDateString("sv-SE", { timeZone: TZ })];
    return s ? hhmm(k) < s.sunrise.slice(11) || hhmm(k) > s.sunset.slice(11) : false; };
  const rows = { day: [], hr: [], w: [], g: [], wd: [], hs: [], sw: [], tp: [], sd: [], cc: [], pr: [], t: [] };
  let lastDay = "";
  for (const k of keys) {
    const h = d.hours[k], w = h.weather.meteofrance_arome_france_hd || h.weather.best_match || {}, b = h.weather.best_match || {}, m = h.marine.meteofrance_wave || h.marine.best_match || {};
    const night = isNight(k) ? ' class="night"' : "";
    const day = new Date(k).toLocaleDateString(LOC, { timeZone: TZ, weekday: "short", day: "numeric" });
    rows.day.push(day !== lastDay ? `<th${night}>${day}</th>` : `<th${night}></th>`); lastDay = day;
    rows.hr.push(`<th${night}>${hhmm(k).slice(0, 2)}</th>`);
    rows.w.push(`<td style="background:${windCol(w.wind_speed_10m)}">${Math.round(w.wind_speed_10m)}</td>`);
    rows.g.push(`<td style="background:${windCol(w.wind_gusts_10m)}">${Math.round(w.wind_gusts_10m)}</td>`);
    rows.wd.push(`<td${night}>${arrow(w.wind_direction_10m)}</td>`);
    rows.hs.push(m.wave_height != null ? `<td style="background:${waveCol(m.wave_height)}">${num(m.wave_height)}</td>` : "<td>–</td>");
    rows.sw.push(m.swell_wave_height != null ? `<td style="background:${waveCol(m.swell_wave_height)}">${num(m.swell_wave_height)}</td>` : "<td>–</td>");
    rows.tp.push(`<td${night}>${m.swell_wave_period != null ? Math.round(m.swell_wave_period) : "–"}</td>`);
    rows.sd.push(`<td${night}>${m.swell_wave_direction != null ? arrow(m.swell_wave_direction) : "–"}</td>`);
    const cc = b.cloud_cover; rows.cc.push(`<td style="background:rgba(200,215,230,${cc != null ? (cc / 100 * .45).toFixed(2) : 0})">${cc != null ? Math.round(cc) : "–"}</td>`);
    const pr = b.precipitation; rows.pr.push(`<td${night} style="color:${pr > 0 ? "#7fd3ff" : "#3a5268"}">${pr != null ? (pr > 0 ? num(pr) : "·") : "–"}</td>`);
    rows.t.push(`<td${night}>${w.temperature_2m != null ? Math.round(w.temperature_2m) : "–"}</td>`);
  }
  const L = { day: "", ...T.fc_rows };
  $("fc").innerHTML = Object.keys(rows).map((r) =>
    `<tr class="r-${r}">${r === "day" || r === "hr" ? `<th>${L[r]}</th>` : `<td>${L[r]}</td>`}${rows[r].join("")}</tr>`).join("");
}

// Copernicus Marine: columna de agua (MEDSEA), corriente por nivel y transparencia (KD490).
getJSON("cmems.json").then((d) => {
  const today = new Date().toISOString().slice(0, 10);
  const days = d.thetao.days, dep = d.thetao.depth_m;
  const day = days[today] ? today : Object.keys(days).filter((k) => k <= today).pop();
  const pts = dep.map((z, i) => [z, days[day][i]]).filter((p) => p[1] != null && p[0] <= 50);
  const tAt = (z) => { if (z <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= z) { const [z0, t0] = pts[i - 1], [z1, t1] = pts[i]; return t0 + (t1 - t0) * (z - z0) / (z1 - z0); }
    return null; };
  const levels = [0, 5, 10, 15, 20, 25, 30, 35, 40].map((z) => [z, tAt(z)]).filter((l) => l[1] != null);
  const tmx = Math.max(...levels.map((l) => l[1])), tmn = Math.min(tmx - 3, ...levels.map((l) => l[1])); // rango mínimo 3 °C: no exagera diferencias pequeñas
  const col = (x) => { const f = Math.max(0, Math.min(1, (x - tmn) / (tmx - tmn)));
    const a = [22, 50, 92], b = [64, 186, 196]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`; };
  const ch = d.currents ? (d.currents.hours[hourKey()] || d.currents.hours[Object.keys(d.currents.hours).filter((k) => k <= hourKey()).pop()]) : null;
  const curAt = (z) => { if (!ch || !ch.length || z > ch[ch.length - 1].depth_m + 3) return "";
    const c = ch.reduce((a, b) => Math.abs(b.depth_m - z) < Math.abs(a.depth_m - z) ? b : a);
    return `<span class="wc-cur" title="${t("cur_to", { d: card(c.to_deg) })}"><span style="display:inline-block;transform:rotate(${c.to_deg}deg)">↑</span> ${num(c.speed_kn)} kn</span>`; };
  $("column").innerHTML = `<div class="wc-head"><span>〰 ${t("wc_surface")}</span><span>${t("wc_current")}</span></div>` + levels.map(([z, x], i) => {
    const dt = i ? x - levels[i - 1][1] : 0;
    return `<div class="wc-row"><span class="wc-z">${z} m</span><span class="wc-bar" style="background:${col(x)}"><b>${num(x)} °C</b>${i && Math.abs(dt) >= 0.15 ? `<i>${sign(dt)}</i>` : ""}</span>${curAt(z)}</div>`; }).join("");
  let jump = null; for (let i = 1; i < levels.length; i++) { const d2 = levels[i - 1][1] - levels[i][1]; if (!jump || d2 > jump.d) jump = { d: d2, z0: levels[i - 1][0], z1: levels[i][0] }; }
  const t0 = levels[0][1], tl = levels[levels.length - 1][1];
  $("prof-s").textContent = jump && jump.d >= 0.5
    ? t("prof_jump", { z0: jump.z0, z1: jump.z1, d: num(jump.d), t: num(t0 - tl) })
    : t("prof_flat", { t0: num(t0), t1: num(tl), z: levels[levels.length - 1][0] });

  if (ch && ch.length) { const s = ch[0], deep = ch[ch.length - 1];
    state.cur = s.to_deg; rose(state.wind, state.swell, state.cur);
    $("n-cur").textContent = `${num(s.speed_kn)} kn`; $("n-cur-s").textContent = t("cur_s", { d: card(s.to_deg) });
    $("lg-cur").textContent = t("lg_cur_v", { s: num(s.speed_kn), d: card(s.to_deg), z: Math.round(deep.depth_m), s2: num(deep.speed_kn), d2: card(deep.to_deg) }); }

  const kd = d.kd490.olci_300m, keys = Object.keys(kd).sort();
  const dshort = (k) => new Date(k).toLocaleDateString(LOC, { day: "numeric", month: "short", timeZone: "UTC" });
  if (keys.length) {
    const last = keys[keys.length - 1], v = kd[last], ago = Math.round((Date.parse(today) - Date.parse(last)) / 864e5);
    $("kd-v").textContent = `${Math.round(v.inv_kd_m)} m`;
    $("kd-s").textContent = t("kd_s", { d: dshort(last), n: ago });
    const max = Math.max(...keys.map((k) => kd[k].inv_kd_m));
    $("kd-bars").innerHTML = keys.slice(-8).map((k) =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mute);margin:2px 0"><span style="width:62px;white-space:nowrap">${dshort(k)}</span>
       <span style="height:8px;border-radius:2px;background:#7fd3ff;width:${(kd[k].inv_kd_m / max * 60).toFixed(0)}%"></span><span>${Math.round(kd[k].inv_kd_m)} m</span></div>`).join("");
  } else $("kd-v").textContent = t("no_value");
}).catch((e) => { $("prof-s").textContent = `${t("no_data")} (${e.message})`; });

getJSON("buoys.json").then((d) => {
  const tb = document.querySelector("#obs tbody");
  for (const [code, b] of Object.entries(d.buoys)) {
    const L = b.latest, last = Object.values(L).map((o) => o.time).sort().pop() || "";
    const wind = L.wind_kn ? `${Math.round(L.wind_kn.value)} kn ${L.wdir ? card(L.wdir.value) : ""}` : "–";
    const when = last ? new Date(last.replace("Z", ":00Z")).toLocaleString(LOC, { timeZone: TZ, day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    tb.insertAdjacentHTML("beforeend", `<tr><td>${T.buoy_names[code] || b.name}</td><td>${wind}</td><td>${L.hs ? num(L.hs.value) + " m" : "–"}</td><td>${L.sst ? num(L.sst.value) + " °C" : "–"}</td><td>${when}</td></tr>`);
  }
}).catch(() => {});

// Gráficos de histórico: SVG propio, un eje, tooltip al pasar el ratón o el dedo.
const C_NOW = "#c7831a", C_PREV = "#2f95cf", C_REF = "#8aa0b3"; // validados contra #12212f
function lineChart(el, o) {
  const draw = () => {
    const W = Math.max(280, el.clientWidth), H = W < 420 ? 200 : 220, L = 38, R = 12, Tp = 12, B = 24;
    const xs = [o.xMin, o.xMax], allY = [];
    o.series.forEach((s) => s.pts.forEach((p) => allY.push(p[1]))); (o.band || []).forEach((b) => allY.push(b[1], b[2]));
    let y0 = Math.floor(Math.min(...allY)), y1 = Math.ceil(Math.max(...allY)); if (o.yZero) y0 = 0;
    const X = (x) => L + (x - xs[0]) / (xs[1] - xs[0]) * (W - L - R), Y = (y) => Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B);
    let g = "";
    const step = o.yStep || Math.max(1, Math.round((y1 - y0) / 4));
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step)
      g += `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" stroke="#22384b"/><text x="${L - 6}" y="${Y(y) + 4}" text-anchor="end" fill="#8aa0b3" font-size="11">${o.yFmt ? o.yFmt(y) : y}</text>`;
    for (const [x, lab] of o.xTicks) g += `<text x="${X(x)}" y="${H - 6}" text-anchor="middle" fill="#8aa0b3" font-size="11">${lab}</text>`;
    if (o.band && o.band.length) {
      const up = o.band.map((b) => `${X(b[0]).toFixed(1)},${Y(b[2]).toFixed(1)}`), dn = o.band.slice().reverse().map((b) => `${X(b[0]).toFixed(1)},${Y(b[1]).toFixed(1)}`);
      g += `<polygon points="${up.concat(dn).join(" ")}" fill="rgba(138,160,179,.16)"/>`;
    }
    for (const s of o.series) {
      g += `<polyline points="${s.pts.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="4 3"' : ""} stroke-linejoin="round"/>`;
      if (s.dots) s.pts.forEach((p) => { g += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="4" fill="${s.color}" stroke="#12212f" stroke-width="2"/>`; });
    }
    g += `<line class="xh" x1="0" x2="0" y1="${Tp}" y2="${H - B}" stroke="#e6eef5" stroke-opacity=".35" visibility="hidden"/>`;
    const legend = o.series.length > 1 || o.band ? `<div class="leg">${o.series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}${o.band ? `<span><i style="background:rgba(138,160,179,.35);height:8px"></i>${o.bandName}</span>` : ""}</div>` : "";
    el.innerHTML = `${legend}<div style="position:relative"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label}">${g}<rect x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}" fill="transparent"/></svg><div class="tip" hidden></div></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), xh = svg.querySelector(".xh");
    const hide = () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); };
    const move = (ev) => { const r = svg.getBoundingClientRect(), px = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      if (px < L || px > W - R) return hide(); const x = Math.round(xs[0] + (px - L) / (W - L - R) * (xs[1] - xs[0]));
      const html = o.tip(x); if (!html) return hide();
      xh.setAttribute("x1", X(x)); xh.setAttribute("x2", X(x)); xh.setAttribute("visibility", "visible");
      tip.innerHTML = html; tip.hidden = false; tip.style.left = Math.min(X(x) + 10, W - 150) + "px"; tip.style.top = "8px"; };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", hide); svg.addEventListener("touchmove", move, { passive: true });
  };
  draw(); let tm; addEventListener("resize", () => { clearTimeout(tm); tm = setTimeout(draw, 150); });
}

getJSON("history.json").then((h) => {
  const deg = (y) => num(y, Number.isInteger(y) ? 0 : 1) + "°";
  const doyOf = (k) => Math.round((Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) - Date.UTC(+k.slice(0, 4), 0, 1)) / 864e5) + 1;
  const monthTicks = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335].map((d, i) => [d + 14, MES[i]]).filter((_, i) => i % 2 === 0);
  const keys = Object.keys(h.sst).sort(), last = keys[keys.length - 1], yNow = +last.slice(0, 4), yPrev = yNow - 1;
  const yearPts = (y) => keys.filter((k) => +k.slice(0, 4) === y).map((k) => [doyOf(k), h.sst[k]]);
  const sm = (pts) => pts.map((p, i) => { const w = pts.slice(Math.max(0, i - 3), i + 4); return [p[0], w.reduce((a, q) => a + q[1], 0) / w.length]; });
  const clim = Object.entries(h.sst_clim_doy).map(([d, v]) => [+d, ...v]).sort((a, b) => a[0] - b[0]);
  const climS = sm(clim.map((c) => [c[0], c[1]])), lo = sm(clim.map((c) => [c[0], c[2]])), hi = sm(clim.map((c) => [c[0], c[3]]));
  const band = clim.map((c, i) => [c[0], lo[i][1], hi[i][1]]);
  const now = yearPts(yNow), prev = yearPts(yPrev);
  lineChart($("ch-year"), {
    label: t("a_year"), xMin: 1, xMax: 366, xTicks: monthTicks, yFmt: deg, yStep: 2,
    series: [{ name: String(yPrev), color: C_PREV, pts: sm(prev) }, { name: t("clim"), color: C_REF, pts: climS, dash: true }, { name: String(yNow), color: C_NOW, pts: sm(now) }],
    band, bandName: t("band"),
    tip: (x) => { const f = (arr) => { const p = arr.find((q) => q[0] === x); return p ? num(p[1]) + " °C" : "–"; };
      const c = clim.find((q) => q[0] === x); if (!c) return "";
      const dt = new Date(Date.UTC(2001, 0, x)); return `<b>${dt.getUTCDate()} ${MES[dt.getUTCMonth()]}</b><br>${yNow}: ${f(now)}<br>${yPrev}: ${f(prev)}<br>${t("mean")}: ${num(c[1])} °C`; },
  });
  { const d0 = new Date(); d0.setFullYear(d0.getFullYear() - 1); const ky = d0.toLocaleDateString("sv-SE", { timeZone: TZ }), dd = h.daily[ky] || {};
    const tY = h.sst[ky], tN = h.sst[last];
    $("ayear").innerHTML = `<b>${t("ayear", { d: d0.toLocaleDateString(LOC, { day: "numeric", month: "long", year: "numeric" }) })}</b>` +
      `<span>${t("ay_water")} <b>${tY != null ? num(tY) + " °C" : "–"}</b>${tY != null && tN != null ? ` (${t("ay_today")} ${sign(tN - tY)})` : ""}</span>` +
      `<span>${t("ay_wind")} <b>${dd.wind_max != null ? Math.round(dd.wind_max) + " kn" : "–"}</b></span><span>${t("ay_gust")} <b>${dd.gust_max != null ? Math.round(dd.gust_max) + " kn" : "–"}</b></span>` +
      `<span>${t("ay_wave")} <b>${dd.wave_max != null ? num(dd.wave_max) + " m" : "–"}</b></span>`; }
  const tNow = h.sst[last], cNow = h.sst_clim_doy[doyOf(last)];
  if (cNow) $("ch-year-s").textContent = t("today_vs", { t: num(tNow), d: sign(tNow - cNow[0]) });

  const years = {}; keys.forEach((k) => { const y = +k.slice(0, 4); (years[y] = years[y] || []).push(h.sst[k]); });
  const trend = Object.entries(years).filter(([, v]) => v.length > 350).map(([y, v]) => [+y, v.reduce((a, b) => a + b, 0) / v.length]);
  lineChart($("ch-trend"), {
    label: t("a_trend"), xMin: trend[0][0], xMax: trend[trend.length - 1][0], yFmt: deg, yStep: 0.5,
    xTicks: trend.filter((p) => p[0] % 10 === 0 || p === trend[0]).map((p) => [p[0], String(p[0])]),
    series: [{ name: t("annual"), color: C_NOW, pts: trend }],
    tip: (x) => { const p = trend.find((q) => q[0] === x); return p ? `<b>${x}</b><br>${num(p[1], 2)} °C` : ""; },
  });
  const a = trend.slice(0, 10), b = trend.slice(-10), avg = (arr) => arr.reduce((s, p) => s + p[1], 0) / arr.length;
  $("ch-trend-s").textContent = t("trend_s", { a: `${a[0][0]}-${a[a.length - 1][0]}`, ta: num(avg(a)), b: `${b[0][0]}-${b[b.length - 1][0]}`, tb: num(avg(b)), d: num(avg(b) - avg(a)) });

  if (h.depth_clim) { const dc = h.depth_clim, C3 = { "0": "#c7831a", "20": "#c85a8a", "40": "#2f95cf" }; // validados, todas las parejas
    const nm = (z) => z === "0" ? t("surface") : `${z} m`;
    const ser = Object.entries(dc.depths).map(([z, v]) => ({ name: nm(z), color: C3[z], pts: v.months.map((m, i) => m ? [i + 1, m[0]] : null).filter(Boolean), dots: true }));
    lineChart($("ch-depth"), { label: t("a_depth"), xMin: 1, xMax: 12, yFmt: deg, yStep: 2,
      xTicks: MES.map((m, i) => [i + 1, m]).filter((_, i) => i % 2 === 0), series: ser,
      tip: (x) => `<b>${MES[x - 1]}</b><br>` + Object.entries(dc.depths).map(([z, v]) => `${nm(z)}: ${v.months[x - 1] ? num(v.months[x - 1][0]) + " °C" : "–"}`).join("<br>") });
    const s0 = dc.depths["0"].months[7][0], s40 = dc.depths["40"].months[7][0];
    $("ch-depth-s").textContent = t("depth_s", { t0: num(s0), t40: num(s40), d: num(s0 - s40), y: `${dc.years[0]}-${dc.years[1]}` }); }

  const dk = Object.keys(h.daily).sort(), yd = +dk[dk.length - 1].slice(0, 4);
  const monthly = (field, filter) => { const acc = Array.from({ length: 12 }, () => []);
    dk.filter(filter).forEach((k) => { const v = h.daily[k][field]; if (v != null) acc[+k.slice(5, 7) - 1].push(v); });
    return acc.map((v, i) => v.length ? [i + 1, v.reduce((s, q) => s + q, 0) / v.length] : null).filter(Boolean); };
  for (const [id, field, unit, fmt] of [["ch-wind", "wind_max", "kn", (v) => Math.round(v)], ["ch-wave", "wave_max", "m", (v) => num(v)]]) {
    const ref = monthly(field, (k) => +k.slice(0, 4) < yd), cur = monthly(field, (k) => +k.slice(0, 4) === yd);
    lineChart($(id), {
      label: id, xMin: 1, xMax: 12, xTicks: MES.map((m, i) => [i + 1, m]).filter((_, i) => i % 2 === 0), yZero: true, yStep: field === "wave_max" ? 0.5 : 5,
      yFmt: (v) => field === "wave_max" ? num(v) : v,
      series: [{ name: t("mean_years", { y: yd - 1 }), color: C_REF, pts: ref, dash: true, dots: true }, { name: String(yd), color: C_NOW, pts: cur, dots: true }],
      tip: (x) => { const r = ref.find((q) => q[0] === x), c = cur.find((q) => q[0] === x); if (!r) return "";
        return `<b>${MES[x - 1]}</b><br>${yd}: ${c ? fmt(c[1]) + " " + unit : "–"}<br>${t("mean")}: ${fmt(r[1])} ${unit}`; },
    });
  }
}).catch((e) => { $("ch-year-s").textContent = `${t("no_data")} (${e.message})`; });

// Satélite: bucle de 3 h, un fotograma cada 20 min. Baleares: lat 37,6-41,6 N, lon 0,7 W-5,7 E (16:10, como la imagen).
(function () {
  const box = $("sat"), range = $("sat-range"), label = $("sat-time"), btn = $("sat-play");
  const base = "https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&styles=&crs=EPSG:4326&bbox=37.6,-0.7,41.6,5.7&width=960&height=600";
  const BB = { s: 37.6, w: -0.7, n: 41.6, e: 5.7 }, pin = $("sat-pin");
  pin.style.left = ((TORO[0] - BB.w) / (BB.e - BB.w) * 100) + "%"; pin.style.top = ((BB.n - TORO[1]) / (BB.n - BB.s) * 100) + "%";
  const end = new Date(Date.now() - 40 * 60e3); end.setUTCMinutes(Math.floor(end.getUTCMinutes() / 10) * 10, 0, 0);
  const times = []; for (let i = 9; i >= 0; i--) times.push(new Date(end - i * 20 * 60e3).toISOString().slice(0, 19) + "Z");
  const frames = times.map((ts, i) => { const f = document.createElement("div"); f.style.cssText = "position:absolute;inset:0;opacity:" + (i === times.length - 1 ? 1 : 0);
    f.innerHTML = `<img alt="" src="${base}&layers=mtg_fd:rgb_geocolour&format=image/jpeg&time=${ts}"><img alt="" src="${base}&layers=mtg_fd:li_afa&format=image/png&transparent=true&time=${ts}">`;
    box.insertBefore(f, box.firstChild); return f; });
  range.max = times.length - 1; range.value = times.length - 1;
  let cur = times.length - 1, timer = null;
  const show = (i) => { frames[cur].style.opacity = 0; cur = i; frames[cur].style.opacity = 1; range.value = i; label.textContent = tzHour(times[i]); };
  const play = () => { timer = setInterval(() => show((cur + 1) % times.length), 600); btn.textContent = "❚❚"; };
  const stop = () => { clearInterval(timer); timer = null; btn.textContent = "▶"; };
  btn.onclick = () => (timer ? stop() : play());
  range.oninput = () => { stop(); show(+range.value); };
  show(cur); setTimeout(play, 2500);
})();
