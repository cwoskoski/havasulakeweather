# HLW-058: Research page — chart every lake we store, not just Havasu

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/117
- **Branch:** `feat/HLW-058-research-all-lakes`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/118
- **Created:** 2026-10-22

## Summary

The /research "Lake & river" section only showed Lake Havasu + Davis/Parker, even though the
daily water snapshot (`WATER#DAILY`) stores every lake in the cascade. Show them all.

## Motivation / context

Stored since HLW-015 (2026-08-18): Havasu + Mohave level/storage/temp, Davis + Parker.
Since HLW-023 (2026-08-23): Powell level/storage/inflow, Grand Canyon flow/temp, Mead
level/storage, Hoover release. `/api/research` filtered to 5 fields (`WATER_FIELDS`).

## Plan

- [x] `research.js`: `WATER_FIELDS` = all 16 stored fields; `waterRow` adds `<lake>PctFull`.
- [x] `POOL` / `pctFull` moved to `ingest/src/pools.js`, shared by water.js + research.js.
- [x] Mock water series for every field.
- [x] Page: section renamed "Lakes & the river" with five charts:
      - all four lakes as **% full** (option a, zero-based),
      - Lake Havasu level (unchanged),
      - water temp for Havasu, Mohave and Grand Canyon,
      - Davis/Parker (unchanged),
      - upstream: Powell inflow, Grand Canyon, Hoover.
- [x] Colors validated with the dataviz palette checker on the dark chart surface: Havasu
      teal / Mohave orange / Mead blue / Powell yellow, adjacent pairs pass CVD + contrast.
- [x] CSV daily export: all lake/river columns (existing `lake_*` names kept).
- [x] Tests; SW v51 / r13.

## Acceptance criteria

- [x] /research → Lakes & river shows Havasu, Mohave, Mead and Powell.
- [x] Daily CSV contains every stored lake/river field.

## Notes

- Only ~2 months of stored history so far. Decades of monthly figures (`HISTORY` in
  water.js, used for "vs history") could feed a long-term view later as its own ticket.
- % full is approximate (published capacities), same as the /water page.
