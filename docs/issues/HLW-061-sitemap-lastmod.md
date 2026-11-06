# HLW-061: Stamp sitemap `lastmod` from git on deploy; IndexNow only changed pages

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/125
- **Branch:** `feat/HLW-061-sitemap-lastmod`
- **PR:** TBD
- **Created:** 2026-11-06

## Summary

Third ticket from the 2026-11-06 SEO audit (deferred in HLW-028). The site deploy sets each
sitemap `<lastmod>` to the date its page last changed on `main`, and pings IndexNow only for
the pages whose date moved, instead of every URL on every deploy.

## Motivation / context

Hand-edited `lastmod`s went stale (home/water said 2026-08-24 while both changed in October).
Google trusts `lastmod` only when it is consistently accurate. IndexNow asks that only
changed URLs be submitted. `changefreq`/`priority` are ignored by Google.

## Plan

- [x] `scripts/sitemap.mjs`: pure `stampSitemap(xml, dateFor)` + `changedUrls(oldXml, newXml)`, plus a small CLI (`stamp`, `changed`)
- [x] Date = last first-parent commit on `main` touching the page file (`/` → `web/index.html`), UTC `YYYY-MM-DD`
- [x] Drop `changefreq` / `priority` from `web/sitemap.xml`
- [x] `deploy.yml` site job: `fetch-depth: 0`; save the live sitemap, stamp, sync, invalidate; IndexNow gets only URLs whose `lastmod` differs from the live one (skip the ping if none)
- [x] Unit tests in `ingest/test/sitemap.test.mjs`
- [x] SW `CACHE` bump (sitemap is under `web/`; no `RELEASE` toast)

## Acceptance criteria

- [ ] After merge, the live sitemap's dates match each page's last change on `main`
- [ ] The deploy log shows IndexNow submitting only changed URLs (or skipping)
- [x] CI green

## Notes

- Local dry run against `main`: all 7 pages stamp 2026-11-06 (HLW-059/060 touched every page) and
  `changed` vs the live sitemap prints nothing. At the pre-HLW-059 commit (`22d1c41`) git gives
  index/water/research 2026-10-22 and radar/rain/wind 2026-10-17 — confirming the old hand-set
  2026-08-24 dates were stale.
- `--first-parent` so a PR's date is the day it merged to `main`, not when its branch commit was made.
- Live sitemap fetched with a `?deploy=<sha>` query (cache-buster); if the fetch fails, IndexNow gets
  every URL (the old behaviour).
- The committed `web/sitemap.xml` is stamped too, so the repo copy matches what deploys.
- Documented in CLAUDE.md (CI/CD): don't hand-edit `lastmod`.
