# HLW-028: SEO — get havasulakeweather.com ranking for local weather queries

- **Status:** in-progress — Phase 1 built + previewed (0 console errors), in PR
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/56
- **Branch:** `feat/HLW-028-seo` (Phase 1; later phases may use their own branches)
- **PR:** <url>
- **Created:** 2026-08-23

## Summary

Act on the SEO audit (seo-specialist agent, 2026-08-23): the site currently sits ~page 5
for "Havasu Lake weather". The homepage's on-page SEO is already strong; what's holding
the site back is domain authority (zero backlinks), near-invisible subpages
(`water.html`/`radar.html` lack canonical/OG/JSON-LD/h1 and aren't in the sitemap), a
duplicate `www` host, and `/water` (extensionless) returning a raw S3 403.

## Motivation / context

- Competitors ranking above us for "Havasu Lake CA weather" (WeatherBug, Wunderground,
  AccuWeather, Weather Network) serve generic model data for 92363 — a real local station
  can beat them once Google trusts the domain.
- "Havasu Landing weather" has **no dedicated result anywhere** and the phrase appears
  nowhere on our site — most winnable keyword gap.
- The water page targets our highest-volume winnable queries ("Lake Havasu water level",
  "water temperature", "Parker Dam releases") and Google can barely see it.
- Not chasing: "Lake Havasu City weather" (AZ head term, owned by majors); the CA/AZ
  disambiguation copy still catches misrouted searchers.

## Plan (phased; each phase = its own PR)

### Phase 1 — quick wins (`web/` only, rides normal CI/CD)

- [x] `web/sitemap.xml`: added `/water.html` + `/radar.html` (lastmod set to the change
      date, 2026-08-24). Deploy-workflow auto-stamp of `lastmod` deferred.
- [x] `web/water.html` + `web/radar.html`: canonical, OG/Twitter tags, an `<h1>`, and
      WebPage + BreadcrumbList JSON-LD. Water page retitled "Lake Havasu Water Level, Dam
      Releases & Water Temperature — Live (Havasu Lake, CA)".
- [x] "Havasu Landing" + "Colorado River" added to homepage About copy and to
      `Place.alternateName`; `sameAs` added — Wikipedia "Havasu Lake, California" +
      Wikidata Q14682145 (which carries GNIS 1660731).
- [x] Static footer nav on all three pages with keyword anchors
      ("Live conditions · Radar · Lake Havasu water level") — always visible, no JS gate.
- [x] Bumped `web/sw.js` CACHE → v32.
- [ ] No-code: verify Google Search Console + Bing Webmaster Tools, submit sitemap (Chad).

### Phase 2 — infra (`site-template.yaml`, separate approval)

- [ ] CloudFront Function on default behavior: 301 `www` → apex; rewrite extensionless
      paths (`/water` → `/water.html`); standardize canonicals/sitemap/internal links on
      clean URLs.
- [ ] `CustomErrorResponses`: 403 → `/404.html` with response code 404; add a simple
      404 page.

### Phase 3 — content (one PR per page/section)

- [ ] Static water-temperature section on `/water` (USBR-sourced; incumbents are scraper
      sites). Optional `Dataset` JSON-LD.
- [ ] FAQ / disambiguation page: "Is Havasu Lake the same as Lake Havasu City?" + time
      zone, lake level, location questions.
- [ ] Monthly climate page ("Havasu Lake weather by month").

### Phase 4 — ongoing (no code)

- [ ] Local link building: Havasu Landing Resort & Casino, community Facebook groups,
      weather-station directories (Ambient map, PWSweather, CWOP), county/Needles
      directories.
- [ ] Monthly GSC review; retune titles/descriptions against real query impressions.

## Acceptance criteria

- [ ] All three pages present in `sitemap.xml` and indexed in Search Console.
- [ ] `water.html`/`radar.html` each have canonical, OG tags, h1, and valid JSON-LD
      (Rich Results test passes).
- [ ] "Havasu Landing" appears in on-page copy and schema.
- [ ] `www.havasulakeweather.com/*` 301s to apex; `/water` and `/radar` resolve 200.
- [ ] Unknown paths return a 404 page with HTTP 404.
- [ ] Measurable: site moves off page 5 for "Havasu Lake weather" (track in GSC; expect
      movement over weeks, not days).

## Notes

- Full audit report in chat (2026-08-23): top findings, keyword table with intent +
  competition, and sources (NWS zone, USGS 09427500, USBR schedules, competitor pages).
- Authority (backlinks) is the #1 lever; on-page fixes are necessary but not sufficient.
- Keyword targets: "havasu lake weather", "havasu landing weather", "havasu lake vs lake
  havasu city", "lake havasu water temperature", "parker dam water release",
  CA-qualified radar/level long-tails.
