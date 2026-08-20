# HLW-014: Water context (normal/low/high) + warnings + level correlation

- **Status:** done (deployed — seasonal context + warnings + 30-day chart live)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/20
- **Branch:** `feat/HLW-014-water-context` (stacked on `feat/HLW-013-water-page`)
- **PR:** (opened from this branch)
- **Created:** 2026-08-18

## Summary

Make the dam/lake numbers legible to non-experts using the decades of history:
each release is labeled **low / normal / high for the season**, with warnings and a
recent-flow chart.

## Research (why seasonal)

RISE has 77–90 yrs of daily data (Parker release from 1935). Releases are **strongly
seasonal** — Davis median swings ~6,000 cfs (winter) to ~15,000 (spring). So year-round
bands would mislabel normal summer flows; **monthly percentile bands** are the right frame,
with an all-time-ish range as backdrop. (Real example: current Davis 4,429 cfs is *low*
for August, typical 8,027–13,390.)

## What was built

- **`ingest/data/water-normals.json`** — monthly p10/median/p90 + range for Davis &
  Parker releases, computed once from ~7yr of RISE daily data (committed static data).
- **`/api/water`** now returns, per release: `context {level, monthLo, monthMed, monthHi,
  allLo, allHi}`; a `warnings[]` array (Davis above seasonal p90 → "high flows below
  Davis"; Havasu below normal → low-lake; Davis low → calmer-water info); and a `series`
  (last ~30 days of Davis/Parker cfs) for the chart. Reuses one RISE series call per dam
  (current + history), all soft-failing.
- **`/water` page**: warnings banner, a **gauge bar** per release (low/normal/high zones
  with a current-value marker) + Low/Normal/High chip + "typical … for <month>", the
  net-flow filling/draining line, and a **30-day Recent-flow line chart**.
- SW bumped to `havasu-wx-v15`.

## Local verification (npm run dev, ?mockWater=)

- `high-release`: warning "High flows below Davis (19,500 cfs)…", Davis/Parker **HIGH**
  chips + gauges, 30-day chart. 0 console errors.
- `low-lake`: "Lake Havasu below normal" warning + Davis **LOW** / Parker **NORMAL** chips.
- Live path returns null releases only while RISE throttles this IP (mocks prove the path;
  temps/levels are live).

## Acceptance criteria

- [x] Releases labeled low/normal/high vs the seasonal band, with typical range shown.
- [x] Warnings: high-flow (Davis) + low-lake + low-flow info.
- [x] Correlation: net flow + 30-day recent-flow chart.
- [ ] Live values confirmed on the page (deploy / RISE cooldown).
- [ ] Chad reviews the local preview.

## Notes / follow-ups

- Baselines use a ~7yr sample; could extend to the full 90yr record and add day-of-year
  smoothing later. Lake elevation context kept on the existing full/low status (RISE
  elevation is a different datum than our USGS value — mixing would be wrong).
