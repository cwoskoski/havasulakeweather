# HLW-056: Research compare — same temperature sensor for both periods

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/111
- **Branch:** `fix/HLW-056-research-compare-sensor`
- **PR:** (pending)
- **Created:** 2026-10-20

## Summary

When comparing periods on the research page, use the same temperature sensor for both.

## Motivation / context

The shaded WH31E sensor started 2026-08-26; the station record starts 2026-08-12. Comparing
a recent week with mid-August picked the shaded sensor for one period and the full-sun array
for the other, so the High/Low/Average deltas mixed sensors (full sun reads much hotter).

## Plan

- [x] Summary tiles: if the two periods would use different sensors, use full sun for both and say so in the note.
- [x] Temperature chart: the dashed comparison line uses shaded air only when both periods have it, otherwise full sun (matching the solid full-sun line).
- [x] SW bump (v48 / r11).

## Acceptance criteria

- [x] 7d vs Aug 15: tiles compare full sun to full sun; note explains; dashed line labelled "Full sun".
- [x] 7d vs previous 7d: still shaded vs shaded; note says "for both periods".

## Notes

Verified locally against live data (proxy to /api). 0 console errors.
