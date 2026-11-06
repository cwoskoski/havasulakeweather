# HLW-059: SEO content refresh — crawlable About copy, FAQ page, titles, visible H1s

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/119
- **Branch:** `feat/HLW-059-seo-content`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/120
- **Created:** 2026-11-06

## Summary

Follow-up SEO pass after many new pages/features since HLW-028. Gives each subpage
static, crawlable text for its target queries, adds a standalone FAQ page that
disambiguates Havasu Lake, CA from Lake Havasu City, AZ, retunes titles/descriptions,
and makes the visible page title the real `<h1>`.

## Motivation / context

An seo-specialist audit (2026-11-06) found the subpages (water, wind, rain, research)
render nearly all copy via JS — Bing often doesn't execute it — and the HLW-028 Phase 3
content (FAQ / disambiguation, static water-temperature copy) was never built. The
Davis Dam "units" explanation (HLW-057) only exists inside a JS string.

## Plan

- [x] Static "About" section (~120–200 words) + `<noscript>` on water, wind, rain, radar, research
- [x] Water copy: Lake Havasu level band, Davis Dam releases + "units", Parker Dam releases, water temp — ranges from our stored history
- [x] New `/faq.html`: Havasu Lake CA vs Lake Havasu City AZ, time zone, Davis units, lake level, station/NWS, data sources; `FAQPage` JSON-LD; sitemap + footer nav + SW shell
- [x] One disambiguation sentence on wind/rain/radar About copy
- [x] Titles/descriptions: water (restore "Water Temperature"), wind, research; homepage + research descriptions ≤ ~155 chars
- [x] Visible header title becomes the `<h1>`; drop the `sr-only` duplicate
- [x] 404 page links to all pages
- [x] SW `CACHE` bump (cache-only; no `RELEASE` toast)

## Acceptance criteria

- [x] Each subpage has readable topic copy with JS disabled
- [x] `/faq.html` is in the sitemap, footer nav, and SW shell; JSON-LD validates
- [x] One visible `<h1>` per page; titles/descriptions updated
- [x] CI green (tests, syntax, secret scan, SW bump)

## Notes

- Water ranges are real data, 2016-01-01 → 2026-11-05: USGS 09427500 daily gage (+402.85 ft →
  NAVD88; p1–p99 449.6–452.6 ft, Dec/Jan median ~450.5 vs June ~451.9) and USBR RISE item 6127
  water temp (Jan/Feb median 53–54°F, Jul/Aug 84–85°F, p90 ~87°F). Release figures from
  `ingest/data/water-normals.json` monthly medians.
- "Havasu Landing" alternate name gets its own FAQ entry (Chad: locals use it for the whole community);
  the homepage `Place` JSON-LD already lists it in `alternateName`.
- Homepage H1 = "Havasu Lake, CA" + "Live outdoor weather" subline, both inside the H1, to keep the
  original header layout (the full "…CA Weather" wrapped to 3 lines at 360px).
- Back button gets `flex:none;white-space:nowrap` so longer titles wrap instead of squeezing it.
- Sitemap: added `/faq.html`; every page's `lastmod` → 2026-11-06 (all changed here). IndexNow picks
  up faq.html automatically (it reads the sitemap).
- SW `CACHE` v51 → v52 + faq.html in the shell; `RELEASE` unchanged (content/SEO — no toast).

Out of scope / follow-ups from the same audit: Dataset + per-page JSON-LD (structured
data), sitemap `lastmod` stamping in deploy.yml, homepage CLS, site-stack 301s/favicon.
