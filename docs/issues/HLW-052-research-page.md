# HLW-052: Research page — explore the station record over any timeframe

- **Status:** done (deployed + prod-verified 2026-10-17)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/101
- **Branch:** `feat/HLW-052-research-page`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/102
- **Created:** 2026-10-17

## Summary

A `/research.html` page where anyone can pick a timeframe (24 h → all data), choose
which measurements to look at, compare against another period, and download the
numbers. Backed by new hourly + daily rollups so long ranges are fast and cheap.

## Motivation / context

- The station records a reading every minute (~1,440/day). `/api/history` serves the raw
  series, which is fine for a day or a week but **times out (502) past ~2–3 weeks**
  (10 s Lambda timeout; 14 d is already 3.5 MB / 9 s). Longer timeframes need rollups.
- HLW-030 (records/almanac) and HLW-040 (climate reports) both planned a `DAY#` daily
  summary layout; building it here gives them their foundation.

## Plan

- [x] **Rollups** (`ingest/src/research.js` pure maths + `ingest/src/rollup.js` handler):
      hourly items `pk = HOUR#<station>#YYYY-MM, sk = <hour ISO>` and Pacific-local daily
      items `pk = DAY#<station>#YYYY, sk = YYYY-MM-DD`. Each metric stores
      `n/sum/min/minAt/max/maxAt` so buckets merge exactly; rain is summed increments;
      direction is a speed-weighted vector. Scheduled hourly at :05, re-rolls the last 3 h.
- [x] **Backfill** `ingest/scripts/backfill-rollups.mjs` (dry-run by default) from the
      raw `OBS#` months.
- [x] **`/api/research?from=&to=`**: resolution picked by span (≤3 d raw → 10/30 min,
      ≤62 d hourly → 1/3/6 h, longer daily). Returns chart points, per-day rows, a range
      summary with when highs/lows happened, and the daily lake/river rows. `?mock=`.
- [x] **`web/research.html`**: range presets + custom dates, metric toggles, stacked
      single-axis charts with a shared crosshair, **period comparison** (previous period /
      same period last year / custom start) overlaid and diffed in the summary, a sortable
      day-by-day table, CSV download, shareable URL state.
- [x] Links from the home page + every footer nav; sitemap; SW `CACHE`+`RELEASE` bump.
- [x] Unit tests for the aggregation, merging, rain, resolution and day-bound helpers.

## Acceptance criteria

- [x] Any range from 24 h to the full record loads in well under the 10 s timeout.
- [x] Comparison overlays a second period of the same length, aligned by offset.
- [x] CSV export matches what's on screen.
- [x] Day boundaries, highs/lows and rain totals are Pacific-local.
- [x] Helpers unit-tested; `?mockResearch=` previews without AWS.

## Notes

- Day rows only time-stamp the headline metrics (shade/sun temp, gust) to keep a full year
  ~280 KB raw (~35 KB brotli at the edge); at daily resolution the day rows double as the
  chart points. The summary carries all times + per-metric counts.
- Hourly ranges top up the not-yet-rolled tail (rollups run at :05) from raw readings, so
  "7 days" is current to the minute.

- Deploy order: merge deploys the rollup Lambda + read API + page together; run the
  backfill (a DynamoDB write — needs Chad's OK) right after so long ranges have data.
- Honest labelling: "since the station went live" — never implies climate normals.
- `/api/history`'s 30 d cap exceeding the timeout is a separate `fix/` ticket.

## Shipped (2026-10-17)

- PR #102 merged → deploy workflow green (site + ingest). New `havasu-weather-rollup` Lambda
  active; manual invoke rolled 3 hours + today.
- Backfill `--write`: 1,580 hour items + 67 day items (station record starts **2026-08-12**).
  Pre-write check: rollup rain per day matched the station's own `dailyrainin` on every rain
  day (1.72" total).
- Live `/api/research`: 24 h raw/10 min 2.9 s · 7 d hourly 1.0 s · 30 d 6 h 2.5 s · all data
  daily 0.9 s (the old `/api/history` 502s past ~3 weeks).
- Follow-ups: (1) summary should pick ONE sensor for both periods when comparing (today each
  period picks shaded/full-sun independently — only diverges if one period predates the
  WH31E, Aug 26); (2) `/api/history` 30 d cap still exceeds the timeout (separate fix ticket).
