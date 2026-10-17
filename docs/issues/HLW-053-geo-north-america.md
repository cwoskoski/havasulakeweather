# HLW-053: Limit the site to North America (US/CA/MX + PR/VI)

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/104
- **Branch:** `feat/HLW-053-geo-north-america`
- **PR:** —
- **Created:** 2026-10-17

## Summary

Serve havasulakeweather.com only to viewers in the United States, Canada, Mexico, Puerto
Rico and the US Virgin Islands, using CloudFront's built-in (free) geo restriction.

## Motivation / context

Chad asked to limit the site to North America. It's a local community site for Havasu
Lake, CA; out-of-region traffic has no audience value.

## Plan

- [x] `site-template.yaml`: `Restrictions.GeoRestriction` whitelist `[US, CA, MX, PR, VI]` on
      the site distribution (covers pages and `/api/*`).
- [x] Leave the ingest distribution (`template.yaml`) unrestricted — the station must always post.
- [x] `web/404.html`: a one-line region note, since blocked viewers get CloudFront's 403, which
      the existing `CustomErrorResponses` maps to the 404 page. SW `CACHE` bump only (not
      user-facing for anyone who can see the site, so no `RELEASE` bump).
- [ ] Deploy (manual — the site stack is not in CI), then verify.

## Acceptance criteria

- [ ] Live distribution shows `GeoRestriction: whitelist [US, CA, MX, PR, VI]`.
- [ ] Site + `/api/*` still load from the US; station ingest still storing readings.

## Notes

- Free CloudFront geo restriction chosen over AWS WAF (~$6–7/mo) — WAF would allow a custom
  "not available in your region" response body; not worth it here.
- IP-geolocation only: US-hosted bots still get through; VPN users / locals traveling abroad
  are blocked. Major search crawlers crawl from US IPs, so SEO risk is low.
- Deploy: `aws cloudformation deploy --template-file site-template.yaml --stack-name
  havasu-weather-site --region us-east-1 --profile havasu` (existing parameter values are
  kept). CloudFront rollout ~5–15 min.
