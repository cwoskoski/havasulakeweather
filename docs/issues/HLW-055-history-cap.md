# HLW-055: /api/history — parallel day queries + 7-day cap

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/110
- **Branch:** `fix/HLW-055-history-cap`
- **PR:** (pending)
- **Created:** 2026-10-20

## Summary

Make `/api/history` (home chart) and `/api/wind` fast, and stop offering ranges the read
Lambda can't serve inside its 10 s timeout.

## Motivation / context

Readings arrive about once a minute, so 7 days is ~10,000 items. `series()` paged each month
serially, so a 7-day request took 5–7.5 s, and anything past ~21 days returned 502. The
`max 30d` cap advertised a range that never worked. Long ranges now have `/api/research`
(HLW-052), which reads hourly/daily rollups.

## Plan

- [x] `daySegments(startISO, nowMs)`: one sort-key window per UTC day (`sk BETWEEN lo AND hi`).
- [x] `series()` queries those days in parallel (each still paginates), then sorts.
- [x] Cap `/api/history` at 7 days (the home chart uses 24 h / 7 d); doc points longer ranges at `/api/research`.
- [x] Unit tests for `daySegments`.

## Acceptance criteria

- [ ] `/api/history?hours=168` and `/api/wind?hours=168` respond well under the timeout (target < 2 s uncached).
- [ ] `?hours=720` returns 7 days instead of a 502.
- [ ] Home chart 24h/7d unchanged.

## Notes

Ingest-only change (read Lambda) — no `web/` change, no SW bump.
