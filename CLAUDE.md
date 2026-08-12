# Havasu Lake Weather — working agreement & project notes

Live community weather site for **Havasu Lake, CA** (San Bernardino County — *not*
Lake Havasu City, AZ) at **havasulakeweather.com**. Fully serverless AWS: an Ambient
WS-2902D station → CloudFront → Lambda → DynamoDB, a static PWA on S3 + CloudFront,
plus free public data (NWS, USGS, USBR RISE, Weather Underground).

## How we work (read this first)

1. **Plan before building.** For any new feature or non-trivial change, first gather
   the info needed (APIs, data, constraints) and **present an implementation plan for
   approval**. Do not start implementing until Chad says go.
2. **One ticket per change.** Track work as a lightweight ticket: a markdown file at
   `docs/issues/HLW-###.md` **and** a matching GitHub issue. (Chad's work projects use
   the `pm-ticket-creator` agent — that's overkill here; keep this simple.)
3. **Feature branches + PRs.** Every change lands on a branch named `feat/HLW-###-slug`
   (or `fix/`, `chore/`) and merges to `main` through a Pull Request that references the
   ticket. Never commit features straight to `main`. Claude opens the PR; **Chad reviews
   and merges.**
4. **Deploys are gated — never deploy without explicit approval.** "Deploy" = anything
   that changes live infra or the live site: `sam deploy`, `aws s3 sync` to the site
   bucket, CloudFront invalidations, DynamoDB/schema changes, new scheduled jobs, etc.
   Building, local mocks, reads, prototypes, and artifacts are fine without asking.
5. **Git is not a deploy.** Committing and pushing *branches* is expected (messages end
   with the `Co-Authored-By` trailer). Merging PRs and deploying are Chad's calls.

## Ticket convention (HLW-###)

- **Numbering:** `HLW-001`, `HLW-002`, … zero-padded, sequential. Next number =
  highest in `docs/issues/` + 1.
- **File:** `docs/issues/HLW-###-short-slug.md`, from `docs/issues/TEMPLATE.md`.
- **GitHub issue:** title `HLW-###: <title>`, created via
  `gh issue create` on `cwoskoski/havasulakeweather`; paste the issue URL back into
  the md.
- **Status:** `proposed` → (approved) `in-progress` → `done`. Keep the status line current.

## Feature flow (end to end)

1. Discuss the idea → gather info → **present a plan** (no code yet).
2. On approval → create `HLW-###.md` + gh issue + a `feat/HLW-###-slug` branch.
3. Build on the branch — mock-first where a preview helps (see mock params below).
4. Push the branch and **open a PR** that references the ticket. Chad reviews + merges.
5. **Ask before deploying.** After merge, on approval → deploy + verify live.
6. Close: set the ticket to `done`, note what shipped.

## Infra quick-reference (non-secret)

| Thing | Value |
|---|---|
| AWS account | `648581682379` |
| SSO profile | `havasu` |
| Regions | ingest/data `us-west-2`; site/CDN/ACM `us-east-1` |
| Ingest+data stack | `havasu-weather-ingest` (`template.yaml`, us-west-2, SAM) |
| Site stack | `havasu-weather-site` (`site-template.yaml`, us-east-1) |
| DynamoDB table | `havasu-weather` (pk/sk, on-demand); obs `pk = OBS#<stationId>#YYYY-MM` |
| Site bucket | `havasu-weather-site-648581682379` |
| Site CloudFront | `E1FK70K9FGVU2M` → havasulakeweather.com |
| Lambdas | `havasu-weather-ingest`, `havasu-weather-read`, `havasu-weather-pws-ingest` |
| Secrets (never commit) | station PASSKEY + WU read key — NoEcho SAM params `AllowedStationKeys`, `WuApiKey` |

## API endpoints (read Lambda, served under CloudFront `/api/*`)

- `/api/current`, `/api/history?hours=N` — our station
- `/api/forecast`, `/api/alerts` — NWS (free, no key)
- `/api/compare` — our station vs nearby WU PWS (`KCAHAVAS2`)
- `/api/water` — lake/river (USGS levels + USBR RISE releases)
- **Preview/mock:** API `?mock=<scenario>`; page `?demo=1`, `?mockAlerts=`,
  `?mockForecast=`, `?mockCompare=`, `?mockWater=`

## Deploy commands (run ONLY with approval)

```bash
# ingest/data stack (us-west-2) — MUST preserve the NoEcho keys or they reset to empty.
# Retrieve current values from the deployed Lambda env, then pass them back:
KEY=$(aws lambda get-function-configuration --function-name havasu-weather-read \
  --region us-west-2 --profile havasu --query 'Environment.Variables.STATION_KEY' --output text)
sam build && sam deploy --parameter-overrides "AllowedStationKeys=$KEY" "WuApiKey=<current>"

# site (us-east-1)
aws s3 sync web/ s3://havasu-weather-site-648581682379/ --profile havasu --region us-east-1 --delete
aws cloudfront create-invalidation --distribution-id E1FK70K9FGVU2M --paths "/*" --profile havasu
```

## Conventions

- **Node 24** (`nodejs24.x`), ESM modules; AWS SDK v3 ships in the runtime.
- **PWA:** bump `web/sw.js` `CACHE` (`havasu-wx-vN`) on any `web/` change so installed
  users pick up the update.
- **Outdoor data only** — never store indoor readings.
- **Secrets** are NoEcho SAM params, passed via `--parameter-overrides`, never committed.
