# HLW-039: Plain-language daily summary ("today at the lake")

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/68
- **Branch:** `feat/HLW-039-daily-summary`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 11 of 13 (feature-research backlog)

## Summary

One templated sentence-or-two at the top of the home page that reads the day for you:
*"Hot and calm this morning — 104° by 3 PM, gusts to 22 mph after noon, lake 82°.
Good morning to be on the water."* Deterministic template over data we already have —
no LLM, no new costs.

## Motivation / context

- Research (2026-08-23): plain-language narratives are the 2025–26 frontier feature
  (Pixel's on-device AI summary, Carrot's narrative, TWC's probabilistic stories), and
  the NWS Area Forecast Discussion is the beloved original. A community site's version
  doesn't need AI — a well-written rule-based template over local data reads just as
  naturally and never hallucinates.
- Synthesizes what we already show (station now + NWS hourly forecast + water temp +
  score/advisories) into the one-glance answer casual visitors want.

## Plan

- [ ] Template engine as a pure helper: condition slots (heat band, wind arc through the
      day from NWS hourly, rain chance, water temp, active advisories, score band) →
      composed sentence(s). Rule table lives in code, unit-tested per branch.
- [ ] Tone/style pass with Chad on ~10 sample days before shipping (the writing *is* the
      feature).
- [ ] Serve from the read Lambda (same inputs as `/api/current` + `/api/forecast`) so the
      text is consistent for all visitors and cacheable.
- [ ] Home page: summary line above the tiles; regenerates with normal data refresh.
      SW bump. Mock scenarios for each major template branch.
- [ ] Link "full forecast discussion" → NWS AFD (free, api.weather.gov product) for the
      weather-curious.

## Acceptance criteria

- [ ] Summary renders for arbitrary current conditions without ungrammatical output
      (unit tests cover branch combinations, including missing inputs).
- [ ] Advisory days always mention the advisory first.
- [ ] Chad has approved the voice on the sample set.
- [ ] No new data sources, no per-request LLM/API costs.

## Notes

- Effort: **medium** — the engineering is easy; the copywriting and branch coverage are
  the real work.
- Dependencies: reads HLW-029's score and HLW-032's advisory class if present; works
  without them.
