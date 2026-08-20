# HLW-013: Dedicated /water page (lake, dams, flow animation)

- **Status:** done (deployed — /water page live)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/18
- **Branch:** `feat/HLW-013-water-page` (stacked on `feat/HLW-002-rise-dam-releases`)
- **PR:** (opened from this branch)
- **Created:** 2026-08-18

## Summary

A dedicated `/water` page for lake & river data, so the home page stays short — and
the natural home for the flow animation. Home page keeps a compact teaser that links to it.

## What was built

- **`web/water.html`** (`/water`): flow-animation hero (Davis Dam inflow → Lake Havasu →
  Parker Dam outflow, particles driven by live cfs), plus cards: Lake Havasu
  (elevation + full/low + water temp), Dam releases (Davis in / Parker out / net),
  Lake Mohave (elevation + water temp), notes, sources.
- **Home teaser**: the preview-only Lake & river card is replaced by a compact
  `Lake & river · <level> ft · <status> · Dams & flow →` link to `/water`.
- **`/api/water` gains water temp** (RISE 6127 Havasu / 6132 Mohave) on lake + upstream.
- **SW** caches `/water.html`, bumped to `havasu-wx-v14`.

Supersedes HLW-003 (card → page), folds in HLW-007 (animation).

## Local verification (npm run dev)

- `/water.html?mockWater=high-release`: animation + all cards populated (in 19,500 /
  out 16,000 / net +3,500; temps 88°F / 76°F). 0 console errors.
- `/water.html` (real): Lake Havasu **452 ft (full), 87.6°F**; Lake Mohave 642.6 ft,
  75.8°F — live. Dam releases show "—" while RISE intermittently throttles this IP
  (the animation falls back to a gentle flow); resolves on deploy.
- Home teaser: real "452.1 ft · Full · Dams & flow →" linking to /water.

## Acceptance criteria

- [x] Dedicated /water page with animation + lake/dam/temp data.
- [x] Compact home teaser + link; home page stays short.
- [x] Water temp surfaced (RISE).
- [ ] Live dam cfs confirmed on the page (deploy / RISE cooldown).
- [ ] Chad reviews the local preview.

## Notes

Preview locally: `npm run dev` → http://localhost:8788/water.html (add
`?mockWater=high-release` / `low-lake` / `normal` to exercise states). No deploy yet.
