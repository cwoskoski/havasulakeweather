# HLW-015: Store lake & dam data (daily snapshots) + acre-feet storage

- **Status:** done (deployed + prod-verified 2026-08-19)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/24
- **Branch:** `feat/HLW-015-store-water-data` (merged)
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/25 (merged)
- **Created:** 2026-08-18

## Summary

We were fetching lake/dam data live on every request (USGS + USBR RISE), edge-cached but
never persisted. Two problems: (1) no history of our own accumulating, and (2) the page
led with **surface elevation in ft**, which reads like water *depth* to someone who
doesn't know these gages. This ticket adds a scheduled snapshot writer, makes `/api/water`
read from those snapshots (live fallback), and surfaces **storage in acre-feet** so the ft
number is unambiguous.

## What was built

- **`ingest/src/water-ingest.js`** — new scheduled handler. Calls `getLive()` and upserts
  one daily snapshot to DynamoDB (`pk = WATER#DAILY`, `sk = <YYYY-MM-DD>`): Havasu/Mohave
  elevation, **storage (acre-ft)**, water temp, and Davis/Parker releases. Idempotent per
  UTC day; skips writing an all-null snapshot when every upstream source hiccups.
- **`template.yaml`** — `WaterIngestFunction` (`havasu-weather-water-ingest`, Timeout 30,
  `rate(6 hours)`, DynamoDBCrudPolicy, `TABLE_NAME` env) + its log group.
- **`ingest/src/water.js`**:
  - `getLive()` now also fetches **storage** — RISE items `6129` (Havasu) / `6134` (Mohave)
    — and returns `storageAf` on `lake`/`upstream`.
  - **`riseNum()` date-scoped** (`dateTime[after]` = 20 days ago, asc, latest point). This
    fixes the RISE hang on the 90-year storage/elevation series (same class of bug as the
    HLW-016 release-query hotfix) and keeps temps/levels/storage fast.
  - `getFromDb()` + `snapshotsToResponse()` — query the last ~35 `WATER#DAILY` snapshots and
    rebuild the `/api/water` shape (lake/upstream/inflow/outflow/series/warnings).
  - `getWater()` is now **DB-first**: return stored snapshots when present, else fall back to
    `getLive()`. (Until the first ingest runs, `source: live`.)
- **`web/water.html`** — Lake Havasu card leads with **"Surface elevation"**, the big ft
  number, and the clarifier *"height of the water above sea level — not depth
  (full pool ≈ 450 ft)"*; adds a **Storage (volume) … acre-ft** metric. Mohave relabeled
  "Surface elev".
- SW bumped to `havasu-wx-v16`.

## Local verification (npm run dev)

- `getWater("normal")` mock → `lake.storageAf 619000`, `upstream.storageAf 1650000`.
- Live `/api/water` → Havasu **451.96 ft / 541,741 acre-ft / 87.6°F**, Mohave 642.38 ft /
  1,743,320 acre-ft, Davis 4,429 (low), Parker 8,630 (normal); `source: live` (DB empty).
- Snapshot the ingest would write: `davisCfs 4429, havasuStorageAf 541741, havasuElevFt 451.96`.
- `/water` page renders storage + the "not depth" note; 0 console errors (Playwright).

## Acceptance criteria

- [x] Scheduled writer persists daily lake/dam snapshots incl. **acre-feet storage**.
- [x] `/api/water` reads snapshots first, falls back to live.
- [x] Page shows storage in acre-ft and clarifies ft = elevation, not depth.
- [x] Deployed; first ingest run wrote `WATER#DAILY` snapshot `2026-08-19`.
- [x] `/api/water` confirmed serving `source: stored` in prod (451.97 ft / 541,741 acre-ft).

## Notes / follow-ups

- Snapshots are our own history from day one; the ~90yr RISE record is only used for the
  seasonal baselines (HLW-014), not backfilled here. A later ticket could backfill history.
- Mohave storage is stored but not shown on the card (kept compact); easy to surface later.
- Retention: snapshots are tiny; on-demand DynamoDB keeps this free for decades.
