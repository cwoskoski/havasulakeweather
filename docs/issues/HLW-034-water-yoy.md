# HLW-034: /water year-over-year — "this date across past years"

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/63
- **Branch:** `feat/HLW-034-water-yoy`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 6 of 13 (feature-research backlog)

## Summary

Add a compact **"Aug 23 across the years"** view to `/water`: today's storage vs. the
same calendar date for the past ~10 years, plus a one-line "vs. a year ago" delta.
Extends HLW-018's percentile callout with the concrete year-list framing people quote
to each other.

## Motivation / context

- Research (2026-08-23): water-data.com's **"last 10 of today's date"** table is the
  benchmark presentation in the reservoir-tracking space, and DesertUSA leads with
  "down X ft from a year ago". Percentiles (which we have from HLW-018) tell you *rank*;
  the year list tells you *story* ("higher than 2022–2024, still below 2019").
- We already hold ~90 years of daily storage/releases in DynamoDB (HLW-017) — this is a
  presentation-layer win on sunk data-engineering cost.

## Plan

- [ ] Extend `build-history-stats.mjs` to also emit a small per-date structure (current
      month is enough: for each of the last 10 years, storage on this calendar date) —
      or compute date-values at build time into `water-history.json`. Keep the
      no-request-time-scan rule.
- [ ] `/api/water`: add `yoy` block — `{ lastYearDelta, years: [{year, value}, …] }`.
- [ ] `/water` Lake Havasu card: "vs. a year ago: −13,200 af" line + tap-to-expand
      10-year mini-table (or tiny bar strip). SW bump.
- [ ] `?mockWater=` scenario covering higher / lower / mixed year patterns.
- [ ] Unit test the date-alignment helper (leap days, missing days → nearest-day rule).

## Acceptance criteria

- [ ] "/water" shows the vs-last-year delta and a 10-year same-date comparison.
- [ ] Missing historical days handled by a documented nearest-day rule, not blanks.
- [ ] Static-file lookup only; no new scheduled jobs or data sources.
- [ ] Helper unit-tested; mock path renders all branches.

## Notes

- Effort: **low** — data already stored (HLW-017), stats pipeline already exists (HLW-018).
- Keep storage (acre-feet) as the metric, consistent with HLW-018's framing decision.
