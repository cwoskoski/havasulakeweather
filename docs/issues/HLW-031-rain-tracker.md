# HLW-031: Rain tracker — days since rain, rain days this year, monsoon season-to-date

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/60
- **Branch:** `feat/HLW-031-rain-tracker`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 3 of 13 (feature-research backlog)

## Summary

Desert-flavored rain accounting: a **"days since measurable rain"** counter, rain-days-
this-year, and a **monsoon season-to-date** total (Jun 15 – Sep 30) with last-season /
prior-year comparison as history accrues. Extends the existing "is it raining right now?"
answer with the question locals ask the rest of the year: *"when did it last rain, and
how's the monsoon doing?"*

## Motivation / context

- Research (2026-08-23): on desert-Southwest community weather sites, the days-since-rain
  counter + rain-season tracker is the single most-cited **favorite feature** (Saratoga
  template "rain season / drought" plugin; NWS Tucson & CLIMAS monsoon trackers that
  hobbyist sites embed). It's cheap, legible, and a conversation piece.
- We already lead the page with "Is it raining in Havasu Lake right now?" — this makes the
  answer interesting on the ~350 days/yr when it's "no".

## Plan

- [ ] Define "measurable rain" (≥ 0.01 in/day) in a pure helper; unit-test the edge cases
      (trace amounts, day boundaries in local time).
- [ ] From HLW-030's daily aggregates: last-rain date/amount, days-since counter,
      rain-days YTD, calendar-year total, monsoon window total (Jun 15 – Sep 30).
- [ ] Expose via `/api/records` (or the rain section of `/api/current`).
- [ ] Home page rain card: "Last rain: Aug 2 (0.24″) — **21 days ago**. Monsoon so far:
      1.10″." Prior-year comparison line once ≥ 2 seasons of data exist. SW bump.
- [ ] Mock scenarios: raining now / rained yesterday / long dry spell / off-season.

## Acceptance criteria

- [ ] Counter is correct across midnight and month boundaries (station-local time).
- [ ] Monsoon total resets on Jun 15 and freezes after Sep 30, labeled with the window.
- [ ] Off-season (Oct–Jun 14) shows year totals instead of an empty monsoon line.
- [ ] All helpers unit-tested; no new data sources.

## Notes

- Effort: **low** once HLW-030's daily aggregates exist (hard dependency).
- Monsoon window Jun 15 – Sep 30 is the NWS definition for the Southwest.
- Later garnish: per-storm totals and a rainfall calendar view (genre staples, not v1).
