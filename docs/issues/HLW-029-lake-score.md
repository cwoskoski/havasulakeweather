# HLW-029: Lake Conditions Score — composite go/no-go for boating & swimming

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/58
- **Branch:** `feat/HLW-029-lake-score`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 1 of 13 (feature-research backlog, see HLW-029…041)

## Summary

A single 0–100 **"Lake Score"** on the home page that answers the question every visitor
actually has — *"is it a good day to be on the water?"* — computed from data we already
ingest: our station's wind/gusts/temp/UV, NWS alerts, and USGS water temp.

## Motivation / context

- Competitive research (2026-08-23) found our closest direct competitor,
  **havasu.info/lake-conditions.html**, already ships a 0–100 "Boating Safety Score"
  (wind + gusts + water temp + air temp; 80+ excellent … <40 stay off) built on the
  *same free stack* we use (USBR RISE + NWS airport obs), updating every 30–60 min.
- Our durable edge: an **on-lake PWS updating every minute** — hyperlocal live wind is
  exactly what wind apps (FishWeather/SailFlow) charge for. A score computed from it is
  both better and more honest than theirs.
- "Activity indices" (good day for X) are a top differentiator across the big apps
  (TWC Activities, AccuWeather lifestyle indices); ours maps directly to boating/swimming.

## Plan

- [ ] Define the scoring formula in a pure helper (`ingest/src/` so it's unit-testable):
      inputs = sustained wind, gusts, air temp, water temp, UV, active wind/storm alerts.
      Piecewise bands, documented weights; output `{ score, band, factors[] }` where
      `factors` explains the biggest detractors ("gusts 28 mph −35").
- [ ] Two framings from one formula: **Boating** (wind/gust dominated) and **Swimming**
      (water temp/UV/air dominated). Decide at design time whether to show one or both.
- [ ] Serve via `/api/current` (or a tiny `/api/score`) so the formula stays server-side
      and consistent; add `?mock=` scenarios covering each band.
- [ ] Home page: score badge near the hero (number + band label + top factor), tap/click
      expands the factor breakdown. SW cache bump.
- [ ] Unit tests for band edges + factor attribution (`npm test`).

## Acceptance criteria

- [ ] Score renders on the home page with band label and at least one plain-language factor.
- [ ] Score degrades gracefully when an input is stale/missing (drops the factor, notes it).
- [ ] Wind advisory / storm alert forces the boating band down (never "excellent" during a
      Lake Wind Advisory).
- [ ] Mock scenarios exercise excellent / fair / poor / stay-off bands.
- [ ] Formula covered by unit tests; no new external data sources, no new secrets.

## Notes

- Effort: **low** — pure arithmetic on data already flowing.
- Related: HLW-032 (advisory banner) feeds the alert input; HLW-035 (swimmability) shares
  the water-temp bands — build the bands once.
- Research: havasu.info score bands; MarineWays publishes a similar boating report for
  Lake Havasu City. Neither has on-lake wind.
