# HLW-041: Air quality tile (EPA AirNow) — smoke & dust awareness

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/70
- **Branch:** `feat/HLW-041-air-quality`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 13 of 13 (feature-research backlog)

## Summary

An AQI tile on the home page fed by the free **EPA AirNow API** — mainly valuable on
wildfire-smoke and blowing-dust days, which is when the community actually checks.

## Motivation / context

- Research (2026-08-23): AQI is now effectively table-stakes in every major weather app
  (Apple, Google, TWC, AccuWeather all lead with it during smoke events). It's the only
  table-stakes gap this site has. AirNow is the official free source (API key, no cost).
- Honest caveat found in research: desert monitor coverage is sparse — the nearest
  official monitors are likely Lake Havasu City / Parker, i.e. regional not hyperlocal.
  Fine for smoke events (regional by nature), and we label the distance.

## Plan

- [ ] **Recon**: query AirNow for the site's lat/lon, record which monitor(s) respond and
      their distance; decide labeling ("AQI — regional, from <monitor> Xmi away").
      If coverage is unusable, evaluate PurpleAir (free key) as fallback and re-scope.
- [ ] Fetch in the read Lambda with caching (AirNow updates hourly; cache ≥ 30 min to
      stay far under rate limits). API key = new NoEcho SAM param, wired through the
      CI deploy's read-back mechanism like the existing keys.
- [ ] `/api/current` (or `/api/aqi`): `{ aqi, category, pollutant, monitor, distanceMi }`.
- [ ] Home tile with EPA category color + label; hidden or "no data" state when the API
      is down. `?mock=` scenarios per category. SW bump.
- [ ] Unit test category mapping at the AQI breakpoints.

## Acceptance criteria

- [ ] Tile shows AQI + EPA category with correct color mapping at all breakpoints.
- [ ] Monitor provenance/distance visible (tap or subtitle) — no false hyperlocal claim.
- [ ] Key stored as NoEcho param; survives a CI redeploy via the parameter read-back.
- [ ] API outage degrades cleanly; cache keeps us within AirNow limits.

## Notes

- Effort: **medium** (new external API + key plumbing).
- Ranked last: real value is episodic (smoke days), and it's the only backlog item
  needing a new external dependency + secret. Pollen: no viable free US API — skipped.
