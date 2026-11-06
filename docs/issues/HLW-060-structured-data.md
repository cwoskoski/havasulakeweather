# HLW-060: Structured data — Dataset on research, self-contained JSON-LD on every page

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/122
- **Branch:** `feat/HLW-060-structured-data`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/123
- **Created:** 2026-11-06

## Summary

Second ticket from the 2026-11-06 SEO audit. Adds a `Dataset` to the research page so the
station record can appear in Google Dataset Search, and makes every subpage's JSON-LD stand
on its own (Google doesn't resolve `@id` references across pages).

## Motivation / context

Subpages point at `#website` and `#place`, which are defined only in `index.html`, so on those
pages the references go nowhere. The water page has no markup for the lake or the dams.

## Plan

- [x] `research.html`: `Dataset` — CC BY 4.0, `temporalCoverage` from 2026-08-12 (open-ended), creator = operator, variables measured, spatial coverage
- [x] Every subpage (water, wind, rain, radar, research, faq): include `WebSite`, operator `Person` and `Place` nodes (same `@id`s as the homepage) and link `WebPage.breadcrumb`
- [x] `water.html`: `LakeBodyOfWater` (Lake Havasu) + Parker Dam / Davis Dam as `Place` (schema.org has no Dam type); page `about` lake + place, `mentions` the dams
- [x] `index.html`: `primaryImageOfPage` as an `ImageObject`
- [x] SW `CACHE` bump (cache-only; no `RELEASE` toast)
- [x] Housekeeping: tick HLW-028's Search Console / Bing verification box (both verified via DNS — Chad, 2026-11-06)

## Acceptance criteria

- [x] Every JSON-LD block parses; no `@id` reference on a page lacks a node on that same page
- [ ] Research page passes Google's Rich Results test as a Dataset (after deploy)
- [x] CI green

## Notes

Decisions (Chad, 2026-11-06): license CC BY 4.0; record starts 2026-08-12.

- Validated pre-merge with validator.schema.org: index, water, wind, rain, radar, research, faq — 0 errors,
  0 warnings. (First pass flagged `Dam` — not a schema.org type — so dams are `Place` with Wikipedia `sameAs`.)
- Shared nodes (`WebSite`, operator `Person`, `Place`) are copied verbatim from `index.html` so the `@id`s match.
- `WebPage.name` on wind/research aligned with the HLW-059 titles.
