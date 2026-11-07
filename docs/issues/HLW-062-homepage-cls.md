# HLW-062: Homepage layout shift (CLS)

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/128
- **Branch:** `feat/HLW-062-homepage-cls`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/129
- **Created:** 2026-11-07

## Summary

Stop the homepage jumping as data arrives (Core Web Vitals CLS). SEO audit item M4.

## Motivation / context

Measured live (Playwright, layout-shift entries, 2026-11-07, with a Lake Wind Advisory active):
mobile 390px **0.30**, desktop first visit **0.26** — both "poor" (> 0.25; good < 0.1).

| Cause | Share |
|---|---|
| NWS alert cards injected above the hero (~86–91 px each) | ~0.10 mobile, most of desktop |
| "Add to home screen" banner injected above the hero at ~4 s (120 px) | 0.14 mobile |
| Forecast section unhidden between rain card and tiles | desktop first visit |
| "Solar Shielded / Full Sun" captions unhidden (+20 px hero) | ~0.06 mobile (with rain text) |

## Plan

- [x] Alerts → one fixed 44px line always present: "Checking NWS alerts…" → most severe alert
      ("💨 Lake Wind Advisory · until 4 PM", "+N more", tone-coloured) or "✓ No active NWS alerts".
      Tap expands the full cards (dismiss × kept); tap-driven shifts don't count toward CLS.
- [x] Install banner → fixed bar floating above the Support button (solid background).
- [x] Forecast shown from the start with a 330px placeholder ("Loading forecast…"); hidden only if
      it never loads or NWS returns nothing.
- [x] Temperature captions visible by default (the station has the shaded sensor); JS still hides
      them when there's no shade reading.
- [x] SW `CACHE` v55 + `RELEASE` r14 (user-facing change)

## Acceptance criteria

- [x] Local preview CLS: mobile 0.30 → **0.022**, desktop 0.26 → **0.002**
- [ ] Live homepage CLS < 0.1 on mobile and desktop after deploy
- [x] Alert line correct for live (1 alert), `?mockAlerts=multi` (2, expandable), `?mockAlerts=clear`

## Notes

- Site traffic is likely too low for Google field (CrUX) data, so this is a lab-measured fix.
- Remaining ~0.02 on mobile is the rain card's message text changing length; left as is.
