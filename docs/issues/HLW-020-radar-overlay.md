# HLW-020: Radar overlay (research parked — free feeds)

- **Status:** proposed (research done; build deferred)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/32
- **Branch:** —
- **PR:** —
- **Created:** 2026-08-21

## Summary

Show a precipitation **radar** view for the Havasu Lake area. Research is done and free,
keyless feeds exist; the build is deferred (Chad wanted the research for now). The main cost
is *display* — the site has no map today.

## Free radar sources (all keyless)

| Source | Endpoint(s) | Notes |
|---|---|---|
| **RainViewer** (recommended) | manifest `https://api.rainviewer.com/public/weather-maps.json` → tiles `{host}{path}/{size}/{z}/{x}/{y}/{color}/{smooth}_{snow}.png` | Past ~2h + nowcast ~+30min frames, nice color schemes, ~10-min cadence, **max zoom 7** (regional). Free community tier, attribution "RainViewer" + link. Nowcast array is empty in dry weather. |
| **Iowa Mesonet (IEM) NEXRAD n0q** | XYZ `…/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png`; archived `nexrad-n0q-m05m … -m55m`; WMS `…/cgi-bin/wms/nexrad/n0q.cgi?` | ~5-min CONUS mosaic, sharper at local zoom, WMS can return one PNG for a bbox (no tiling). Credit IEM. |
| **NOAA MRMS** (nowCOAST / RIDGE II) | nowCOAST MapServer + RIDGE II ImageServer (`mapservices.weather.noaa.gov`) | Authoritative, public-domain, but ArcGIS hosts occasionally migrate URLs — less set-and-forget. |

## Lightest integration (no map library — matches our self-contained rule)

External **image/tile** hosts are fine (we already pass through NWS icon images); an external
**script** CDN is not. So a map is doable without Leaflet/MapLibre:

1. **IEM single-image loop (lightest):** one WMS PNG for a fixed bbox around the lake over a
   static local basemap, looped through `-m55m … -m05m … now` via `<img>` swaps. Zero JS
   libs, sharp local detail, fixed extent.
2. **RainViewer hand-placed tile grid:** precompute the 2×2/3×3 tile indices for the lake at
   zoom ≤7, render as absolutely-positioned `<img>` tiles (radar ~0.6 opacity over a static
   base), animate by swapping each tile's frame `path` from the manifest. ~40 lines, nicer
   colors + nowcast, no lib.
3. **Self-hosted Leaflet/MapLibre (heaviest):** only if we want true pan/zoom later; bump SW.

Suggested API shape when built: proxy the manifest via `/api/radar` (cache ~5 min, inject
attribution), browser loads tiles/images directly from the source host.

## When picked up

- Decide: a small **radar card** on the home page vs a dedicated **/radar page** (like /water).
- Pick source (RainViewer for look + nowcast; IEM for lightest/sharpest).
- Attribution + a "not an official product" note.

## Out of scope (for now)

- Any build — this ticket parks the research. Promote to a `feat/HLW-020-*` branch on approval.
