# HLW-050: Make the Lake & River panel prominent on the home page

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/97
- **Branch:** `feat/HLW-050-lake-river-panel`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/98
- **Created:** 2026-09-16

## Summary

The home page's Lake & River element is a thin one-line link strip tucked between the Sun
arc and the temperature chart. For a lake community, lake level + river flow deserve real
weight. Redesign it into a **full-width water-themed panel** and move it **directly above the
Air Quality panel**, and surface **more river + current lake-level detail** that `/api/water`
already returns.

## Motivation / context

Lake level and dam releases are top-of-mind for boaters/residents here. The data is already
fetched (and, post-HLW-049, cached) — the home page just under-used it. No backend change.

## Plan

- [ ] **Move** `#waterTeaser` out of the Sun→Chart slot into the `.tiles` grid, full-width
      (`grid-column:1/-1`), immediately **before** `#aqiTile` (the two full-width panels stack).
- [ ] **Redesign** the slim strip into a big glass panel (water/teal themed, wave icon):
  - Lake: large elevation (`448.2 ft`) + trend badge (▲ Rising +N cfs / ▼ Draining / Holding),
    a `NN°F water` chip, a **% full** progress bar, and a seasonal-context line
    ("Higher than 60% of past Septembers").
  - River: **Inflow · Davis Dam** and **Outflow · Parker Dam** releases (cfs + trend arrow).
  - Whole panel stays an `<a href="/water.html">` (keeps `id="waterTeaser"` + HLW-024 click
    tracking). Every field degrades gracefully when missing.
- [ ] **Expand `renderWater()`** to populate the new fields from `cascade[havasu]`
      (`elevationFt`, `pctFull`, `netTrend`/`netCfs`, `waterTempF`, `history`) plus top-level
      `inflow` / `outflow`.
- [ ] SW `CACHE` v41→v43, `RELEASE` r5→r7 (user-facing; leapfrogs HLW-049's v42/r6).

## Acceptance criteria

- [ ] A full-width Lake & River panel renders directly above Air Quality with elevation,
      trend, water temp, % full bar, seasonal context, and Davis/Parker releases.
- [ ] Panel still links to `/water.html`; click tracking intact; missing fields hide cleanly.
- [ ] `node --check` clean; `npm test` green; SW cache + release bumped (`v43`/`r7`).

## Notes

- Data source: `/api/water` → `cascade[key==="havasu"]` (reservoir node) + top-level
  `inflow` (Davis Dam release into Havasu) and `outflow` (Parker Dam release downstream).
- Independent of the open HLW-049 PR (branched off `origin/main`); if HLW-049 merges first,
  this rebases cleanly (SW already leapfrogged to v43/r7).
