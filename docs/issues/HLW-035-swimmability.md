# HLW-035: Water-temp swimmability framing on /water and home

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/64
- **Branch:** `feat/HLW-035-swimmability`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 7 of 13 (feature-research backlog)

## Summary

Frame the USGS water temperature we already display as an answer: **"Is the water
swimmable?"** — comfort bands (cold-water caution / brisk / comfortable / bath-warm)
plus seasonal context ("typical for late August: 82–86°F") from stored water data.

## Motivation / context

- Research (2026-08-23): LakeMonster and seatemperature.net both monetize "swimmability"
  framing; lake-community sites (Watauga, Keuka) present water temp with seasonal-range
  context as prominently as air temp. A number alone ("78°F") makes visitors do the
  interpretation — the site should do it for them.
- Cold-water safety is real content, not filler: sustained immersion below ~70°F carries
  documented cold-shock/swim-failure risk (National Center for Cold Water Safety) —
  worth a caution badge in winter/spring.

## Plan

- [ ] Define bands in a pure helper (shared with HLW-029's swimming score input):
      < 60 dangerous-cold · 60–70 cold-water caution · 70–78 brisk · 78–85 comfortable ·
      > 85 very warm. Cite the <70 caution source in code comment.
- [ ] Seasonal context: monthly typical range from our stored water history (HLW-015/017
      data; same static-stats pattern as HLW-018).
- [ ] `/api/water`: add `{ band, label, monthTypical: {lo, hi} }` to the water-temp block.
- [ ] `/water` + home-page water tile: band label + seasonal line; caution badge styling
      for the two cold bands. SW bump.
- [ ] `?mockWater=` scenarios for each band.

## Acceptance criteria

- [ ] Water temp shows a band label everywhere it appears, consistent between pages.
- [ ] Cold bands (< 70°F) render a visually distinct caution treatment.
- [ ] Seasonal "typical for <month>" line appears when history exists for that month.
- [ ] Band helper unit-tested at every boundary; mocks cover all bands.

## Notes

- Effort: **low**. Band thresholds are a product decision — confirm the numbers above
  at plan-approval time.
- Shared bands with HLW-029 (swim score) — implement once, import twice.
