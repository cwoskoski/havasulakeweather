# HLW-037: Sun & moon upgrade — moon phase, day-length delta, solunar bite times

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/66
- **Branch:** `feat/HLW-037-sun-moon-solunar`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 9 of 13 (feature-research backlog)

## Summary

Extend the HLW-021 sun arc into a full sun & moon card: **moon phase + moonrise/set**,
a day-length delta ("1 m 48 s shorter than yesterday"), and **solunar fishing times**
(major/minor bite windows). All pure client-side astronomy — no API, no backend.

## Motivation / context

- Research (2026-08-23): moon phase is near-universal (every major app); the day-length
  delta is a beloved small touch in the PWS-site genre (Saratoga/Belchertown); and
  solunar bite times are the free version of what Fishbrain sells as "BiteTime".
  Anglers are a core audience for this lake — solunar majors/minors (moon transit /
  moon-underfoot ± ~1 h; minors at moonrise/set) are a standard published calculation.
- HLW-021 already established the client-side-astronomy pattern; this is more of the same.

## Plan

- [ ] Add moon math to the existing client-side astronomy code (or vendor a small
      suncalc-style lib into `web/vendor/`): phase + illumination %, moonrise/set,
      transit/underfoot times. No network calls.
- [ ] Day-length delta vs. yesterday, computed locally.
- [ ] Solunar card: today's two majors + two minors as time ranges, phase-aware quality
      hint (new/full = stronger); label it plainly as the traditional solunar theory.
- [ ] Placement: extend the sun-arc card on home; fuller version could live on `/water`
      (fishing context). SW bump.
- [ ] Unit-test the astronomy helpers against published ephemeris values for Havasu Lake's
      coordinates (a few known dates).

## Acceptance criteria

- [ ] Moon phase + rise/set correct for the site's lat/lon vs. published values (± a few
      minutes).
- [ ] Day-length delta matches yesterday-vs-today sunrise/sunset math.
- [ ] Solunar majors/minors render for today with sensible ranges; date rollover works.
- [ ] Zero new network requests; works offline once cached.

## Notes

- Effort: **low-medium** (math + tests, no infra).
- Related: HLW-021 (sun arc — extend, don't duplicate). Solunar feeds a future fishing
  framing on `/water`.
