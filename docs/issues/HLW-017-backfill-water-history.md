# HLW-017: Backfill historical lake & dam data (RISE storage + releases)

- **Status:** done (backfill executed + verified 2026-08-19)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/26
- **Branch:** `feat/HLW-017-backfill-water-history`
- **PR:** (opened from this branch)
- **Created:** 2026-08-19

## Summary

HLW-015 started storing one `WATER#DAILY` snapshot per day going forward. This ticket
backfills the decades of daily history RISE already publishes, so long-term context
(multi-year storage/flow charts, "lowest August storage in N years") is available from
stored data instead of accumulating a day at a time.

## Scope (datum-clean, RISE-sourced)

One `WATER#DAILY` row per historical day, populated from RISE catalog items:

| Field | RISE item | Record starts |
|---|---|---|
| `havasuStorageAf` | 6129 | 1938-10-01 |
| `mohaveStorageAf` | 6134 | 1950-02-02 |
| `davisCfs` (inflow) | 6135 | 1949-03-01 |
| `parkerCfs` (outflow) | 6130 | 1935-01-02 |
| `havasuTempF` / `mohaveTempF` | 6127 / 6132 | 2006-11 (recent only) |

## Explicitly NOT backfilled: historical elevation

Live elevation comes from **USGS** (gage height + 402.85 datum ≈ 452 ft). RISE's own
elevation series uses a **different datum** (~448 ft full pool), so mixing them would put a
~4 ft step right at the join with today's rows. USGS also has no usable daily-value
elevation series this far back (dv query returns no series). Historical rows therefore
carry **storage (acre-ft, datum-independent)** and leave `havasuElevFt`/`mohaveElevFt`
null. Elevation keeps being captured live from USGS going forward.

## Approach

- One-off **local** Node script (`ingest/scripts/backfill-water.mjs`), run with the
  `havasu` SSO profile — not a Lambda.
- Fetch RISE per item in **date windows** (windowed queries are fast, ~450ms/yr, and
  avoid the full-series `order=desc` hang from HLW-016).
- Merge per-item series by date → daily snapshots; `BatchWriteItem` (25/batch) into
  `havasu-weather` (`pk = WATER#DAILY`, `sk = <YYYY-MM-DD>`). Upsert-safe.
- **Dry-run first** (`--dry-run`, default): fetch + report counts / date ranges / samples,
  write nothing. Prod write (`--write`) only on explicit approval (gated).

## Acceptance criteria

- [x] Dry-run reports total days, per-series date ranges, sample rows, est. cost/size.
- [x] Rows written for the full record: **33,467 backfilled** days, 1935-01-02 → 2026-08-18
      (~5.4 MB, ~$0.04 writes). Table now holds **33,468** `WATER#DAILY` rows (incl. today's
      live row, left intact with its USGS elevation).
- [x] Live `/api/water` path unchanged — `source: stored`, 30-day chart now a full series.
- [x] Spot-check: 1980-10-25 → Havasu 553,500 af / Mohave 1,466,400 af / Davis 15,300 /
      Parker 13,000; 1935-01-02 → Parker 4,460 (Parker alone reaches back that far).

## Coverage (as loaded)

| Series | Days | Range |
|---|---|---|
| Havasu storage (af) | 31,558 | 1938-10-01 → 2026-08-17 |
| Mohave storage (af) | 27,936 | 1950-02-02 → 2026-08-17 |
| Davis release (cfs) | 28,295 | 1949-03-01 → 2026-08-18 |
| Parker release (cfs) | 33,465 | 1935-01-02 → 2026-08-18 |
| Havasu temp (F) | 7,101 | 2006-11-23 → 2026-08-18 |
| Mohave temp (F) | 6,554 | 2008-04-10 → 2026-08-18 |

## Notes / follow-ups

- Backfill rows have `source`-less shape (no `updatedAt` from live ingest); harmless.
- A later ticket could add a long-range chart / "compared to history" callout on `/water`
  now that the data exists.
