# Build Plan

Serverless AWS backend for the Havasu Lake weather station. See
[architecture.md](architecture.md) for the design and the reasoning behind it.

## Decisions

Defaults below are **proposed** — change any before we start Phase 0.

| Decision        | Choice                                                                 |
|-----------------|------------------------------------------------------------------------|
| Platform        | AWS, serverless (SAM)                                                   |
| Region          | `us-west-2`                                                            |
| Runtime         | Node.js 20                                                              |
| Auth / profile  | IAM Identity Center → profile `havasu` (account `648581682379`) — **done** |
| Domain          | Start on free `*.cloudfront.net`; add a custom domain in Phase 3       |
| Retention       | Keep everything, no TTL; optional S3/Athena archive later              |
| Budget alarm    | Email alert at **$5/month**                                            |
| Ingest format   | Ambient Weather format (confirmed against the first real payload)      |
| Station MAC     | TBD — captured automatically from the first logged payload (`PASSKEY`) |

## Phase 0 — Foundations

- [x] Personal `havasu` SSO profile + verified caller identity
- [ ] AWS Budgets alarm ($5/mo) → email
- [ ] SAM scaffold: `template.yaml` + `samconfig.toml` (pinned to `havasu`, us-west-2)
- [ ] Retire Pi-era bits: `deploy/` (systemd/Litestream) removed; `ingest/src/server.js`
      converted to the Lambda handler

## Phase 1 — Ingest, logger-first

- [ ] Node 20 **logger** Lambda + Function URL + CloudFront
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

- [ ] S3 + CloudFront static page; JSON API Lambda (`/api/current`, `/api/history`)
- [ ] Edge cache 30–60s; uPlot charts; mobile-first
- [ ] Custom domain + ACM cert (**us-east-1** for CloudFront); "not an official
      observation" disclaimer

## Cost

~**$0–2/month** (mostly DynamoDB storage as history grows). A custom domain, if
added, is ~$10–12/year.
