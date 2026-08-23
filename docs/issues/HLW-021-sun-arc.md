# HLW-021: Sunrise & sunset (live sun-arc, client-side)

- **Status:** in-progress (approved: sun-arc strip)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/34
- **Branch:** `feat/HLW-021-sun-arc`
- **PR:** (opened from this branch)
- **Created:** 2026-08-23

## Summary

Show today's **sunrise and sunset** with a sun-arc: an arc from sunrise to sunset, a dot at
the sun's current position, times at each end, and daylight length. Live only, no history.

## Approach — no backend

Sunrise/sunset are a pure function of lat/lon + date, and the page already carries our exact
coordinates (34.4822, −114.4138). Compute them **client-side** with the standard NOAA/SunCalc
solar formula (~30 lines) — instant, exact for Havasu Lake, works offline in the PWA, no API,
no Lambda, no external dependency. Refreshes daily; the position dot updates each minute.

- Times displayed in **Havasu Lake local time** (America/Los_Angeles) regardless of the
  viewer's timezone (`toLocaleTimeString` with an explicit `timeZone`). The current-position
  fraction compares absolute instants, so it's timezone-independent.
- **Site-only** change: `web/index.html` (+ SW bump). No read-Lambda deploy.

## Plan

- Add a `.sun-arc` glass panel after the tiles row: an SVG arc (quadratic curve) with a
  warm dawn→noon→dusk gradient, a sun dot positioned along the arc by the day's elapsed
  fraction, a horizon line, and sunrise/sunset times at the ends + "Hh Mm of daylight".
- Night (before sunrise / after sunset): dim the arc, park the dot at the horizon.
- JS: `sunEvents(date, lat, lng)` (SunCalc algorithm) + `renderSun()` on load + every minute.

## Acceptance criteria

- [ ] Sun-arc shows correct sunrise/sunset for Havasu Lake in Pacific time.
- [ ] Dot sits at the right spot for the current time; night state handled.
- [ ] No backend/API/external dependency; 0 console errors; theme-consistent.
- [ ] Deploy: site only (gated).

## Out of scope

- Sunrise/sunset for future days, golden-hour, moon phase (live-only per request).
