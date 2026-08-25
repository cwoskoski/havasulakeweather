# HLW-043: IndexNow ping on deploy (instant Bing/Yandex recrawl)

- **Status:** in-progress (built; in PR)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/77
- **Branch:** `feat/HLW-043-indexnow`
- **Created:** 2026-08-24

## Summary

On each **site** deploy, ping IndexNow so Bing / Yandex (and other participating engines)
re-crawl the changed pages immediately instead of waiting for the periodic sitemap crawl.
Google does **not** support IndexNow — it still relies on the sitemap + Search Console.

## How

- `web/23b65e54-…​.txt` — the IndexNow ownership key file (a UUID; public, hosted at the
  site root so engines can verify the key).
- `.github/workflows/deploy.yml` — new step in the `deploy-site` job (after the CloudFront
  invalidation): POSTs the sitemap's `<loc>` URLs to `https://api.indexnow.org/indexnow`
  with `host` + `key` + `keyLocation`. **Best-effort** — a non-2xx is a `::warning::`, never
  fails the deploy.
- SW `CACHE` → v37 (the key file is a `web/` change); `RELEASE` unchanged (silent).

## Notes

- Key is in UUID form so its longest hex run (12) stays under the secret-scan's 30-char threshold.
- Submits the full sitemap URL set on each site deploy (3 URLs) — simple and within IndexNow norms.
- Runs only on `deploy-site`, i.e. when `web/` changed.

## Acceptance

- [x] `deploy.yml` valid YAML; JSON body builds correctly from the local sitemap.
- [ ] CI green.
- [ ] After a deploy: the IndexNow step returns 200/202; Bing's URL-submission view shows the pings.
