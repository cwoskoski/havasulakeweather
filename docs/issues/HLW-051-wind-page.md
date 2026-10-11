# HLW-051: Wind page — wind history, wind rose and when-it's-windy heatmap

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/99
- **Branch:** `feat/HLW-051-wind-page`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/100
- **Created:** 2026-10-11

## Summary

A dedicated `/wind.html` page that shows the station's wind history: how hard it blew,
how gusty it was, where it came from and at what time of day — for the last 24 hours,
3 days or 7 days.

## Motivation / context

- The home page only shows the current wind. Boaters want to know the pattern: when the
  afternoon wind comes up, how gusty it gets and from which direction.
- A week of station data (2026-10-04 → 10-11) is mostly calm (median 0.9 mph, 53% of
  readings under 1 mph) with a clear afternoon peak around 3 pm and two dominant
  directions (W, and E/SE). A plain speed line looks flat, so the page leads with
  "when does it blow, and from where".
- Looked at how other sites present station wind: Windfinder (average + gust lines with
  a direction-arrow row), iKitesurf/WindAlert (average inside a gust band), WeeWX skins
  and Iowa Mesonet (wind rose), Windguru (colour-coded speed cells).

## Plan

- [x] `ingest/src/wind.js` — pure helpers: bucketed timeline (avg, peak gust, vector-mean
      direction), 16-sector × 5-bin wind rose, per-day stats with an hourly grid; mock
      scenarios run through the same summarizer.
- [x] `/api/wind?hours=N` on the read Lambda (max 7 d, 5-min edge cache,
      `?mock=calm|breezy|gusty`). ~150 buckets / ~15 KB instead of the raw 1.7 MB series.
- [x] `web/wind.html` — now strip, range tabs, timeline (gust band + night shading +
      direction arrows + hover), wind rose, hour-by-hour heatmap (3 d / 7 d), daily table.
      Hand-rolled SVG/HTML, no chart library. Page mock: `?mockWind=calm|breezy|gusty`.
- [x] Home wind block links to the page; footer nav on every page; sitemap; SW shell,
      `CACHE` v44, `RELEASE` r8.
- [x] Unit tests (`ingest/test/wind.test.mjs`).

## Acceptance criteria

- [ ] `/wind.html` renders the timeline, rose and daily table for 24 h / 3 d / 7 d from
      live station data, on a phone and on desktop.
- [ ] Rose shares + calm share add up to 100%; days and hours are Pacific local time.
- [ ] Station dropouts show as gaps in the timeline, not straight lines.
- [ ] Tapping the wind block on the home page opens the wind page.

## Notes

- **Arrow convention:** timeline arrows and the hero arrow point the way the wind is
  *blowing* (windsock, same as Windfinder); text always says where it's *from*. The hero
  compass also marks the source with a dot on the rim. The home compass needle still
  points at the source — worth unifying in a follow-up if it reads as inconsistent.
- **No 30-day range:** `/api/history?hours=720` currently fails (response too large for
  Lambda). Month/year roses need the precomputed daily aggregates from HLW-030, so they
  stay with HLW-040, which is now narrowed to long-period roses + climate reports.
- **Speed bins** (mph): calm < 1, 1–4, 4–8, 8–13, 13–19, 19+ (≈ Beaufort 1–5+).
- `/api/wind` deliberately does not echo a `station` field.
