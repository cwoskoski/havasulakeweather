# HLW-054: Radar — NOAA MRMS observed radar, warning polygons, lightning

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/107
- **Branch:** `feat/HLW-054-radar-mrms`
- **PR:** —
- **Created:** 2026-10-17

## Summary

Make `/radar` look better and be more accurate: swap the observed radar from RainViewer to
NOAA MRMS (1 km, ~2-min scans), keep the HRRR future frames, and add NWS storm-warning
polygons plus lightning (NOAA density layer + our own detector).

## Motivation / context

- RainViewer's free API was cut back through 2025–26: max zoom 7, nowcast removed, and a
  single color scheme. We request scheme 6, but it now silently serves scheme 2 ("Universal
  Blue", byte-identical tiles) — so the page's green/yellow/red legend no longer matched the
  observed frames, and colors jumped at the hand-off to the HRRR forecast. No paid tier exists.
- NOAA MRMS is free and keyless, 1 km, updates every ~2 min, and uses the same NWS
  reflectivity palette as IEM's HRRR tiles (verified pixel-for-pixel), so observed and
  forecast frames finally match.
- Paid providers (Xweather, Tomorrow.io, Windy) wouldn't look better here — they all draw
  on the same Las Vegas radar (KESX).

## Plan

- [x] `/api/radar`: observed frames from the MRMS WMS `GetCapabilities` time list (NCEP
      GeoServer `conus_bref_qcd`; nowCOAST `base_reflectivity_mosaic` fallback), ~10-min
      spacing over 2 h; NWS storm-based warnings with polygons near the lake; nowCOAST
      lightning layer info; `?mock=warning` preview. Cache 2 min.
- [x] `web/radar.html`: WMS radar frames; tiles drawn to canvas and **weak echoes (< ~4–12 dBZ)
      faded** identically for observed + HRRR; server-side bilinear smoothing at zoom ≥ 8;
      max zoom 10; NWS-ramp legend; warning polygons + banner; layer chips (warnings,
      NOAA lightning); our detector's last hour; honest radar-coverage note.
- [x] Tests for `parseWmsTimes`, `pickFrames`, `stormWarnings`. SW `v47` / `r10`.

## Acceptance criteria

- [x] Observed frames load from NOAA with NWS colors matching the legend and HRRR frames.
- [x] Sharper than before at zoom 7; smooth (not blocky) at zoom 9–10.
- [x] Warning polygons render (mock) with a banner; "No storm warnings nearby" otherwise.
- [x] Falls back to nowCOAST, then forecast-only, if NOAA sources fail.

## Notes

- KESX (Las Vegas) is 142 km away; lowest beam ~3.8 km above the lake → shallow showers and
  virga can be missed. Every source shares this; the page says so.
- NOAA publishes no rate policy for these WMS endpoints; our load is current+next frame only.
  Watch after launch.
