# HLW-019: 7-day forecast strip on the home page

- **Status:** in-progress (approved: compact strip)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/31
- **Branch:** `feat/HLW-019-seven-day-forecast`
- **PR:** (opened from this branch)
- **Created:** 2026-08-21

## Summary

The Forecast card only shows today + a 12-hour hourly strip, even though the read Lambda
**already fetches all 7 NWS days** (it just uses `daily[0]`). Add a compact **7-day strip**
so the week is visible at a glance. No new data source — NWS tops out at 7 days and that's
fine (see HLW-020 for why 10-day would need a different source; we chose 7).

## Plan

- **`ingest/src/nws.js`** — add a paired **`days`** array to the forecast response: iterate
  the day/night periods, group by local date, and emit up to 7 `{date, weekday, hiF, loF,
  precipProb, shortForecast, glyph, isDaytime}`. `hiF` from the daytime period, `loF` from
  the night, `precipProb` = max of the two. Dependency-free condition **glyph** mapped from
  the forecast text (☀ 🌤 ☁ 🌧 ⛈ 🌨 🌫). Keep `hourly` + `rainSoon` + `daily` unchanged.
  Add `days` to the `rain`/`clear` mocks.
- **`web/index.html`** — render a horizontal 7-day strip (weekday · glyph · hi° · lo° ·
  precip%) under the hourly row in the Forecast card; scrolls on narrow screens. No external
  icon images.
- Bump `web/sw.js` cache.

## Acceptance criteria

- [ ] `/api/forecast` returns a `days` array (7 entries) with hi/lo/precip/glyph.
- [ ] Home page shows the 7-day strip; `?mockForecast=rain` and `=clear` exercise it.
- [ ] No external image/script dependencies added; 0 console errors.
- [ ] Deploy: site + read Lambda (gated).

## Out of scope

- True 10-day (would need Open-Meteo — parked; NWS caps at 7). See HLW-020 for radar.
