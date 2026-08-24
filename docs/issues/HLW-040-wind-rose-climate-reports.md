# HLW-040: Wind rose + NOAA-style monthly climate reports

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/69
- **Branch:** `feat/HLW-040-wind-rose-climate-reports`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 12 of 13 (feature-research backlog)

## Summary

Two enthusiast-grade almanac features from stored station data: a **wind rose**
(direction/speed frequency, selectable period) and **monthly climate summary reports**
(NOAA-style text/table: daily hi/lo/rain for the month, means, extremes).

## Motivation / context

- Research (2026-08-23): both are genre-standard credibility features on serious PWS
  sites (WeeWX ships NOAA-format reports out of the box; wind roses are a Saratoga-
  template staple). They signal "real station, real record" — the thing that separates
  a community station from an app screenshot — and boaters actually read wind roses
  (prevailing afternoon direction matters on this lake).

## Plan

- [ ] Wind rose: aggregate direction (16 sectors) × speed bins from stored obs — monthly
      + yearly precomputed into the HLW-030 static-stats output; render as a small SVG
      on a stats/almanac page (no chart library).
- [ ] Monthly report: from HLW-030's daily aggregates, generate the classic table
      (day, hi, lo, rain; monthly mean/max/min/total) as a page per month + plain-text
      view; months are immutable once complete → build once, cache forever.
- [ ] Navigation: an "Almanac" page linking records (HLW-030), reports, wind rose.
      SW bump.
- [ ] Unit tests for sector/bin math and report totals.

## Acceptance criteria

- [ ] Wind rose renders for month/year periods and matches hand-checked sector counts.
- [ ] Every complete month since station start has a report page; current month says
      "in progress".
- [ ] Static/pregenerated output only — no request-time aggregation.

## Notes

- Effort: **medium**; hard dependency on HLW-030's daily aggregates and stats pipeline.
- Ranked low on general-audience impact, high on credibility with the weather/boating
  crowd — a good "polish era" ticket.
