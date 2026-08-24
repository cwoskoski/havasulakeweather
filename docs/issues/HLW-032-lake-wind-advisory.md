# HLW-032: Surface Lake Wind Advisories as a distinct boater warning

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/61
- **Branch:** `feat/HLW-032-lake-wind-advisory`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 4 of 13 (feature-research backlog)

## Summary

When NWS issues a **Lake Wind Advisory** (the inland-lake equivalent of a small-craft
advisory), present it as a distinct, boater-styled banner — not just another line in the
generic alerts list. Presentation-only change on data we already fetch.

## Motivation / context

- Research (2026-08-23): NWS Las Vegas issues Lake Wind Advisories for the lake zone
  (AZ zone **AZZ002 "Lake Havasu and Fort Mohave"** covers the lake surface) and even
  maintains a Lake Havasu recreation forecast page (weather.gov/vef/RecHV). No consumer
  app gives this advisory lake-specific prominence — it's free differentiation and a
  genuine safety feature for the community.
- We already consume `/api/alerts`; this is labeling + styling, plus one verification
  task about zones.

## Plan

- [ ] **Verify zone coverage**: confirm which zone(s) our alerts point-query returns for
      the CA-side community, and whether Lake Wind Advisories for the lake surface arrive
      via that point or only via AZZ002. If needed, additionally poll the AZZ002 zone feed
      in the read Lambda (still api.weather.gov, still free).
- [ ] Classify alert types in a pure helper: Lake Wind Advisory / wind-related warnings →
      "boater warning" class; unit-test with real CAP payloads.
- [ ] Home page + `/water`: distinct banner (wind icon, "Boaters: Lake Wind Advisory until
      7 PM") ahead of the generic alert list; respects the HLW-025 dismissal-persistence
      behavior. SW bump.
- [ ] `?mockAlerts=` scenario for the advisory.
- [ ] Feed the advisory state into HLW-029's score as the alert input (if that ships first,
      wire it; otherwise note the interface).

## Acceptance criteria

- [ ] An active Lake Wind Advisory renders the boater banner on home and `/water`.
- [ ] Generic alerts are unaffected; dismissal persistence still works.
- [ ] Zone verification documented in this ticket (which zone, which query).
- [ ] Mock scenario demonstrates the banner without a live advisory.

## Notes

- Effort: **very low** (barring zone surprises). Highest safety-value-per-line-of-code
  item in the backlog.
- Link weather.gov/vef/RecHV from `/water` as a "more" reference (zero-cost credibility).
