# HLW-046: water ingest resilience — carry-forward last-good, retry USGS

- **Status:** in-progress — built + verified locally 2026-09-01; ready for PR. Deploy gated on Chad's merge.
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/85
- **Branch:** `fix/HLW-046-water-carry-forward`
- **PR:** _(opens after build)_
- **Created:** 2026-09-01

## Summary

A single slow USGS response blanks the lake level for up to 6 hours. Make the scheduled
water-ingest resilient: **carry forward the last-good value** instead of overwriting a good
snapshot with `null`, and give the USGS fetch **one retry + a bit more timeout** so a merely
slow response doesn't fail at all.

## Root cause (diagnosed)

`2026-08-31 14:42` the ingest ran **10.3s** (vs ~6s) and logged `havasuElevFt: null`. USGS
answered too slowly and exceeded the 8s fetch timeout; the ingest wrote
`havasuElevFt: lake.elevationFt ?? null` → a **null clobbered the good snapshot**. `/api/water`
served the blank lake until the next good run (20:42) overwrote it. Not rate-limiting — our
cadence is a gentle `rate(6 hours)`; USGS was just briefly slow, and the ingest was fragile.

## Plan

- [x] **`water-ingest.js` carry-forward:** reads the latest `WATER#DAILY` snapshot; for each
      data field uses `fresh ?? previous ?? null`. Pure exported `carryForward(fresh, prev)` →
      `{ merged, carried }`, logs the carried keys. Kept the "skip all-null" guard.
- [x] **`water.js usgsLatest`:** one retry with 500ms backoff; per-attempt timeout 8s (Lambda
      timeout 30s, USGS calls run in parallel → ≤ ~16s worst case).
- [x] **Test:** `ingest/test/water-ingest.test.mjs` (fresh wins; null → prev; both null → null;
      no prev; the 08-31 shape). `npm test` **66/66** green.
- [x] **Verified locally (read-only dry run vs real DynamoDB):** prev=2026-09-01 elev 451.13;
      normal run → fresh 451.31, nothing carried; simulated USGS blip → elev/storage/mohave
      carried forward (not null), fresh RISE still wins. Exactly the 08-31 failure, fixed.
- [ ] PR → Chad merges (deploy). Post-deploy: manual ingest run stores a full snapshot; `/api/water` lake stays populated.

## Notes

- Carrying a value forward slightly under-states that field's freshness (the snapshot date reads
  "today"), but lake level moves inches/day — a stale-but-valid level beats a blank one, and the
  existing schema already stores bare numbers without per-field observedAt.
- Nothing is broken right now (self-healed 2026-08-31 20:42); this is preventative for the next
  USGS hiccup.
