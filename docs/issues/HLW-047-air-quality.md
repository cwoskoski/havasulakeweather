# HLW-047: Air Quality tile (Open-Meteo US AQI + next-24h peak)

- **Status:** in-progress — built + previewed locally 2026-09-01; shipping. Deploy = Chad's merge.
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/88
- **Branch:** `feat/HLW-047-air-quality`
- **PR:** _(opens after local preview)_
- **Created:** 2026-09-01

## Summary

Add an **Air Quality** stat tile to the home page — current **US AQI** (color-coded category +
dominant pollutant) plus a **next-24h peak** heads-up — backed by a new keyless `/api/air`
(Open-Meteo Air Quality / CAMS). No dedicated page: AQI is a single headline number + category +
one pollutant + a short forecast, which is tile-sized (a page like /water or /radar earns its keep
with history charts / cascade / map; AQI has no such depth).

## Motivation / context

Desert-SW summer/fall = wildfire smoke + blowing dust. A lake community planning boating/outdoor
time benefits from an at-a-glance "is the air OK / smoky today" with a short look-ahead. AQI is
naturally color-coded (Good→Hazardous), so it mirrors the existing UV tile.

## Source (decided)

**Open-Meteo Air Quality only** — free, keyless, CAMS-modeled at the lake's exact lat/lon (beats
AirNow's nearest-monitor, which is miles off across the river for this remote spot). Confirmed live:
US AQI 55 (Moderate), PM2.5-driven; per-pollutant `us_aqi_*` sub-indices returned (for the dominant
pollutant); hourly forecast to 7 days. Attribution: **CAMS + Open-Meteo**.

## Plan

- [x] **`ingest/src/air.js` + `/api/air`** (read Lambda): current `us_aqi` + `us_aqi_*` sub-indices
      + `pm2_5/pm10/ozone/dust` concentrations + hourly `us_aqi`. Returns `{ aqi, category,
      categorySlug, dominant, pollutants:{pm25,pm10,ozone,dust}, peak:{aqi,category,at}, source }`.
      Pure helpers `aqiCategory` / `dominant` (argmax sub-index) / `peakNext24`. Cache 1h; soft-fail.
- [x] **`web/index.html`:** **full-width panel** (`grid-column:1/-1`, no dangling 5th slot) — AQI
      number + color-coded category chip + **pollutant breakdown** (PM2.5/PM10/Ozone/Dust µg/m³) +
      "PM2.5 driving · modeled (CAMS)" + conditional "↑ NN by \<time\>" next-24h peak. Each pollutant
      is a button that opens a **help balloon** (plain-language explainer + scale; Esc/tap-away closes;
      `.tiles` lifted to `z-index:20` so the balloon isn't clipped by the panel below). SW → `v40`/`r4`.
- [x] **Test:** `ingest/test/air.test.mjs` (aqiCategory / dominant / peakNext24). `npm test` **71/71**.
- [x] Local preview verified (tile, breakdown one-row at 390px, balloons over adjacent panels) → PR → Chad merges (deploy).

## Acceptance criteria

- [x] Home page shows a color-coded AQI panel with the pollutant breakdown, per-pollutant help
      balloons, dominant pollutant, and a (conditional) next-24h peak.
- [x] Keyless (no new secrets); `npm test` 71/71; SW cache + release bumped (`v40`/`r4`).

## Notes

- US AQI categories: 0–50 Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive Groups,
  151–200 Unhealthy, 201–300 Very Unhealthy, 301+ Hazardous.
- `dominant` = the pollutant whose `us_aqi_*` sub-index equals the overall `us_aqi` (the max).
- Modeled (CAMS), not an EPA monitor — label the source honestly. AirNow (official, keyed) is a
  possible later cross-check, out of scope here.
