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
- [ ] AWS Budgets alarm → email (low threshold + forecasted-to-exceed). Free tier is
      the target; the alarm is the safety net.
- [ ] SAM scaffold: `template.yaml` + `samconfig.toml` (pinned to `havasu`, us-west-2)
- [ ] Retire Pi-era bits: `deploy/` (systemd/Litestream) removed; `ingest/src/server.js`
      converted to the Lambda handler

## Phase 1 — Ingest, logger-first

- [ ] Node 24 **logger** Lambda + Function URL + CloudFront
      (viewer allows HTTP:80, `CachingDisabled`, forwards all query strings)
- [ ] `sam deploy` → grab the `*.cloudfront.net` URL
- [ ] Configure the console's "Customized" upload (Ambient format) → CloudFront URL, port 80
- [ ] Capture one real payload in CloudWatch → finalize the field list + note the MAC

## Phase 2 — Storage + hardening

- [ ] DynamoDB table (`PK = MAC#YYYY-MM-DD`, `SK = dateutc`, on-demand)
- [ ] Lambda: parse→map, MAC allowlist, idempotent conditional put, store `dateutc`
      + receive time, log unknown keys
- [ ] Lock the Function URL to CloudFront (OAC), reserved concurrency, secret path
- [ ] Keep AmbientWeather.net + Wunderground uploads on as a backup path

## Phase 3 — Public page (later)

See [product-spec.md](product-spec.md) for the full design.

- [ ] S3 + CloudFront static page; JSON API Lambda (`/api/current`, `/api/history`)
- [ ] Current conditions: wind + temp hero, outdoor tiles, freshness/stale state
- [ ] Live updates: poll edge-cached `/api/current`, repaint only changed values
- [ ] History charts (uPlot): 24h / 7d; mobile-first, responsive to desktop
- [ ] History backfill from the AmbientWeather.net API (seed so charts aren't empty)
- [ ] Donation: dismissible splash + button, hosted payment link, `localStorage` "donated" flag
- [ ] Custom domain `havasulakeweather.com` + ACM cert (**us-east-1** for CloudFront);
      "not an official observation" disclaimer

## Cost

~**$0–2/month** (mostly DynamoDB storage as history grows). A custom domain, if
added, is ~$10–12/year.
