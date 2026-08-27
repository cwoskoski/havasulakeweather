# HLW-045: Radar future frames — HRRR simulated reflectivity nowcast (+6h)

- **Status:** in-progress — built + previewed locally 2026-08-27; ready for PR. Deploy gated on Chad's merge.
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/82
- **Branch:** `feat/HLW-045-radar-future`
- **PR:** _(opens after local preview)_
- **Created:** 2026-08-27

## Summary

Extend the `/radar` loop with a **+6h "future radar"** using **HRRR simulated reflectivity**
(REFD) tiles from Iowa Environmental Mesonet (IEM) — free, keyless, standard XYZ tiles that
slot into the existing Leaflet layers. Observed RainViewer radar (past ~2h) flows into HRRR
model frames (now → +6h), with a **"now" divider** on the scrubber and clear "forecast (model)"
labeling.

## Motivation / context

RainViewer's nowcast maxes at ~30 min and is empty in dry weather, so the current page has no
real "next hours" prediction. HRRR simulated reflectivity gives a genuine "watch it roll in over
the next few hours" future radar. It is a **model forecast**, not observed radar — labeled as
such for honesty on a public community site. Skillful ~0–6h, which is why we cap at +6h.

## Plan (approved: +6h, divider, small proxy)

- [x] **`/api/radar` proxy** (`read.js` + `radar.js`): returns
      `{ observed: { host, past[], nowcast[] } (RainViewer), forecast: { source, initUnix, tileTemplate, frames[] } }`.
      Fetches the RainViewer manifest, resolves the freshest **verified** HRRR init (steps back an
      hour if a run isn't processed yet → no 503s from unprocessed runs), and builds 30-min-step
      frames from now → +6h. Edge-cache 5 min; soft-fails to whichever side works.
- [x] **`web/radar.html`**: fetches `/api/radar`; renders observed (RainViewer) + forecast (IEM HRRR)
      layers keyed by frame `kind`; **"now" divider** on the slider; gold "+Nh · forecast (model)"
      labels to +6h; honesty note. **Throttled** to current+next layer only (IEM renders on-demand and
      503s under a full-frame burst). Bumped SW `CACHE v39` + `RELEASE r3`.
- [x] **CARTO basemap fix (folded in):** CARTO began gating their free raster basemap, so `/radar`
      showed "API KEY REQUIRED" watermarks **live**. Swapped to the authenticated `rastertiles/dark_all`
      endpoint with Chad's CARTO key (a public, domain-restricted client token).
- [x] Local preview + screenshots; console clean (0 errors); `npm test` 61/61.

## Data source

`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F{fmin}-{YYYYMMDDHHmm}/{z}/{x}/{y}.png`
— 15-min steps to +18h; new run ~:50 past the hour UTC (hourly); commercial use allowed,
attribution appreciated (IEM recommends pinning the init time, not the `-0` latest shortcut).

## Acceptance criteria

- [x] `/radar` animates past → now → +6h; "now" divider visible; forecast frames labeled as model.
- [x] No new **server** secret (the CARTO basemap key is a public, domain-restricted client token);
      radar data (RainViewer + HRRR) stays keyless. `npm test` 61/61; SW cache + release bumped.

## Notes

- Observed radar (RainViewer) is real; HRRR REFD is model-simulated reflectivity (a forecast).
  UX makes the distinction obvious (divider + gold forecast tags + note).
- Forecast step = 30 min (12 frames to +6h) — balance of smoothness vs tile load; tunable.
- Tiles load in the browser directly from RainViewer + IEM; the proxy only returns small JSON.
- **IEM 503s (fixed two ways):** (1) IEM only serves runs it's processed — pinning the previous
  top-of-hour sometimes hit an unprocessed run mid-window, so the proxy now probes and steps back
  an hour until a live run answers 200. (2) IEM's tile.py renders on-demand and 503s when hit by all
  12 forecast frames at once — the page now keeps only the current+next layer on the map. Both
  confirmed: console 0 errors after these.
- **CARTO basemap key** lives in `radar.html` (public client token, fine to commit — it's not a
  server secret). Should be **domain-restricted to havasulakeweather.com** in the CARTO dashboard.
  Longest hex run in the key is 24 chars, so the CI 30-hex secret-scan doesn't trip.
- **Future option:** CARTO is retiring raster basemaps in favor of vector (sharper, restyleable).
  Migrating would mean swapping Leaflet for a GL renderer (MapLibre) — worth its own ticket later;
  the same key already covers vector.
- **Preview polish (from Chad's review):** (1) the time label moved to its own centered row so the
  slider width is constant — the NOW divider no longer jumps as the label text changes width;
  (2) frames/providers **cross-fade** (CSS opacity transition + the outgoing layer lingers one beat);
  (3) RainViewer switched to the **NEXRAD** color scheme (`color=6`) + legend updated, so observed
  matches HRRR's NWS green→red ramp; (4) **two-tone scrubber** — teal (observed/past) → gold
  (forecast/future), split at NOW. Residual observed-vs-forecast differences (cyan vs lavender light
  echoes, radar ~1km vs model ~3km) are inherent and left as a subtle real/forecast cue.
