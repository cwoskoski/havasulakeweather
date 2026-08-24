# HLW-030: Station records & almanac — today vs. month / year / all-time

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/59
- **Branch:** `feat/HLW-030-records-almanac`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 2 of 13 (feature-research backlog)

## Summary

Put our stored observation history to work: daily/monthly/yearly/all-time highs & lows
("records since the station went live"), a **records snapshot widget** on the home page,
and a "this day last year" context line. This is the defining feature family of the
community-weather-site genre, and it's computable entirely from our own DynamoDB data.

## Motivation / context

- Research (2026-08-23): the records hierarchy (today / this month / this year / all-time)
  is effectively the **genre standard** — it's the CumulusMX default menu, WeeWX ships
  NOAA-style summaries out of the box, and the modern benchmark (Belchertown skin) puts a
  "record snapshots" widget on the homepage rather than burying it.
- The big apps monetize exactly this ("today vs. average" in Apple, Carrot Time Travel);
  WU's per-station almanac is its stickiest surviving feature.
- It compounds: every month the station runs, the records get more interesting — and it's
  the base layer for HLW-031 (rain tracker) and HLW-040 (climate reports).

## Plan

- [ ] **Daily aggregates**: a scheduled job (or on-ingest rollup) writing one compact
      daily-summary item per day — hi/lo temp (+times), max gust, rain total, avg wind,
      pressure range — under a new `pk = DAY#<stationId>#YYYY` layout. Backfill from the
      existing `OBS#` months on first run.
- [ ] **Records materialization**: from the daily items, precompute month / year / all-time
      records into a small static JSON (same pattern as HLW-018's `water-history.json` —
      no request-time scans).
- [ ] **`/api/records`** (or extend `/api/current`): today's hi/lo so far + current
      month/year/all-time records + this-day-last-year values.
- [ ] **Home page**: records-snapshot card ("Today 71–104°. Hottest Aug 23 on record: 111°
      (2025)"); "this day last year" one-liner. SW bump.
- [ ] Unit tests for the aggregation + record-comparison helpers.

## Acceptance criteria

- [ ] Daily summaries exist for the station's full history (backfilled) and accrue daily.
- [ ] Records widget shows today vs. month/year/all-time with correct tie/record handling
      (a new record labels itself as such).
- [ ] "This day last year" renders when data exists; hidden cleanly when not.
- [ ] No request-time table scans; DynamoDB cost delta ~zero (one item/day + static JSON).
- [ ] Helpers unit-tested; mock scenarios for record / non-record days.

## Notes

- Effort: **medium** — new aggregation job + backfill, but simple math throughout.
- Honesty rule: label everything "since <station start month/year>" — never imply
  climate-period records. (Official normals could come later via free NOAA ACIS.)
- Dependency for: HLW-031 (rain counters), HLW-040 (wind rose / monthly reports).
