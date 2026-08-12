# Build Plan

Serverless AWS backend for the Havasu Lake weather station. The application design
(*what* we're building) is in [product-spec.md](product-spec.md); the system design and
rationale in [architecture.md](architecture.md). This file is the *build sequence*.

## Decisions

Defaults below are **proposed** — change any before we start Phase 0.

| Decision        | Choice                                                                 |
|-----------------|------------------------------------------------------------------------|
| Platform        | AWS, serverless (SAM)                                                   |
| Region          | `us-west-2`                                                            |
| Runtime         | Node.js 24                                                              |
| Auth / profile  | IAM Identity Center → profile `havasu` (account `648581682379`) — **done** |
| Domain          | Start on free `*.cloudfront.net`; add a custom domain in Phase 3       |
| Retention       | Keep everything, no TTL; optional S3/Athena archive later              |
| Budget alarm    | Email alert at **$5/month**                                            |
| Ingest format   | Ambient Weather format (confirmed against the first real payload)      |
| Station MAC     | TBD — captured automatically from the first logged payload (`PASSKEY`) |

## Phase 0 — Foundations

- [x] Personal `havasu` SSO profile + verified caller identity
- [ ] Register `havasulakeweather.com` (Route 53) — needs registrant contact info
- [x] AWS Budgets alarm → email (`havasu-weather-monthly`, $5/mo, alerts at $1 actual
      + forecasted-to-exceed). Free tier is the target; the alarm is the safety net.
- [x] SAM scaffold: `template.yaml` + `samconfig.toml` (pinned to `havasu`, us-west-2)
- [x] Retire Pi-era bits: `deploy/` (systemd/Litestream) removed; `ingest/src/server.js`
      converted to the Lambda handler

## Phase 1 — Ingest, logger-first

- [x] Node 24 **logger** Lambda + Function URL + CloudFront
      (viewer allows HTTP:80, `CachingDisabled`, forwards all query strings)
- [x] `sam deploy` → **http://dzn7sq96yz34g.cloudfront.net/** (verified end-to-end:
      curl on port 80 → CloudFront → Lambda → logged in CloudWatch)
- [x] Configure the console's "Customized" upload (Ambient format) → CloudFront URL, port 80.
      Gotchas: the Server field wants a **bare hostname** (no `http://`); the Path must end
      with `?` (`/data/report/?`) or the params get jammed into the path instead of the query.
- [x] Capture a real payload → **Ambient format confirmed**; 23 outdoor fields; station key
      `00A418…B2DC4`; posting every 60s. **No `rainratein`** — so "raining now" must key off
      the rain counters (`eventrainin`/`hourlyrainin`/`dailyrainin`) incrementing.

## Phase 2 — Storage + hardening

- [x] DynamoDB table `havasu-weather` (on-demand). Time-series `pk = OBS#<key>#YYYY-MM`,
      `sk = dateutc`; each item carries `rainingNow`/`lastRainAt`.
- [x] Lambda storage: **watermark pattern** (1 write/reading, in-memory rain state),
      station-key allowlist, idempotent put, drop indoor, rain-now from `totalrainin`.
- [ ] Lock the Function URL to CloudFront (OAC), reserved concurrency — hardening pass.
- [x] Keep AmbientWeather.net upload on as a backup path (still enabled).

## Phase 3 — Public page — **LIVE at havasulakeweather.com**

Built on mock #6 (Lake Lifestyle). See [product-spec.md](product-spec.md).

- [x] JSON read API (`/api/current`, `/api/history`) — edge-cached via CloudFront `/api/*`
- [x] S3 (private, OAC) + CloudFront + TLS on `havasulakeweather.com` + `www`; `/api/*` → read Lambda
- [x] Current conditions: wind + temp hero, outdoor tiles, freshness/stale state
- [x] Live updates: poll `/api/current` every 60s, flash only changed values
- [x] History chart (inline SVG): 24h / 7d toggle; mobile-first, responsive to desktop
- [x] Donation: Venmo + Cash App (no email/Zelle), suggested amounts, QR codes, `localStorage` flag
- [x] **Installable PWA**: manifest + service worker + icons + install banner (Android prompt / iOS Share hint)
- [x] "not an official observation" disclaimer

## Remaining polish (optional)

- [ ] Lock the **ingest** Function URL to CloudFront-only (OAC) — the Phase 2 hardening
- [ ] History backfill from the AmbientWeather.net API (needs AWN app/API keys)
- [ ] Optional UX: auto-open donation splash on first visit; "update available" refresh toast
- [ ] Scrub the removed P2P screenshots from git history before any public GitHub push

## Cost

~**$0–2/month** (mostly DynamoDB storage as history grows). A custom domain, if
added, is ~$10–12/year.
