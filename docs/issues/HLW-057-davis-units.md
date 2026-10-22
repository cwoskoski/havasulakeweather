# HLW-057: Davis Dam releases as "units" with a low-water warning

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/114
- **Branch:** `feat/HLW-057-davis-units`
- **PR:** _pending_
- **Created:** 2026-10-22

## Summary

Show the Davis Dam release the way river boaters talk about it — how many generating
**units** are running — with a rating and a low-water warning.

## Motivation / context

Locals on the river below Davis Dam (Laughlin → Topock → Havasu) describe the river by
"units" running rather than cfs. One Davis unit ≈ **4,600 cfs** (Nevada Colorado River
Commission, July 2025; river forums: "1 unit = 4600 CFS, 5 units is all WFO"). Chad's
rule of thumb: **minimum 2 units, 3+ is good**.

## Plan

- [x] `davisUnits(cfs)` in `ingest/src/water.js`: cfs ÷ 4,600, rounded to the nearest half;
      rating from the rounded value — `< 2` low, `2 to < 3` minimum, `3+` good.
- [x] Attach `units` to the Davis `inflow` and the `davis` cascade node (stored, live, mock).
- [x] Warning (severity `warning`) when Davis is under 2 units; replaces the old
      "low for the season — calmer water" info message, which contradicted it.
- [x] `/water` cascade: units badge on the Davis pill (replaces the seasonal chip there)
      + a one-line "what's a unit" note. Home teaser: `≈N units` badge on the Davis line.
- [x] Mocks: `davis-low` (~1.5), `davis-minimum` (~2.5), `davis-good` (~3.5).
- [x] Tests: boundaries (1.5 / 2 / 2.5 / 3 / 5), rounding, warning on/off, Davis-only.
- [x] `sw.js` CACHE v49 + RELEASE r12 (leapfrogs PR #113's v48/r11).

## Acceptance criteria

- [x] `/api/water` returns `inflow.units = { units, rating, cfsPerUnit }` for Davis; Parker has none.
- [x] Under 2 units → a Davis low-water warning on `/water`; 2+ → no warning.
- [x] Badge colors: low = coral, minimum = gold, good = teal.

## Notes

- **Davis only.** We don't assume a per-unit figure or thresholds for Parker.
- **Daily average.** RISE gives one daily release value; Davis actually swings with power
  demand (e.g. 4 units afternoons, 1 overnight). The note says "daily average" so nobody
  reads it as the live count. Follow-up idea: Reclamation's hourly release schedule for
  "units right now".
- 4,600 is a typical full-load unit, not max hydraulic capacity (rated ~31,000 cfs total),
  so readings like "≈2.5 units" are expected.
