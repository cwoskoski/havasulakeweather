# HLW-012: Local dev — run the read API locally against real data

- **Status:** done (dev server: `npm run dev` → localhost against the real read API)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/14
- **Branch:** `feat/HLW-012-local-dev-server`
- **PR:** (opened from this branch)
- **Created:** 2026-08-12

## Summary

Run the read API locally so we can test the whole site (real conditions, forecast,
alerts, compare, water, and all the `?mock=` states) without deploying.

## Motivation

Right now every change to the API means `sam deploy` + CloudFront invalidation to see
it. A local runner tightens the loop and reduces deploys — which pairs well with the
"deploys are gated" rule.

## Proposed approach (Docker-free)

- `dev/server.mjs`: a small Node http server that
  - serves `web/` static files, and
  - for `/api/*`, builds a Function-URL-style event (`rawPath`, `requestContext.http.method`,
    `queryStringParameters`) and calls the `handler` exported from `ingest/src/read.js`.
- Uses the `havasu` SSO profile for DynamoDB and hits the real external APIs (NWS / USGS / WU).
- Secrets from a **gitignored `.env.local`** (TABLE_NAME, STATION_KEY, WU_API_KEY, NWS_*,
  RISE_*) — or fetched from the deployed Lambda config at startup so nothing lives on disk.
- Point the frontend's localhost API base at the local server (same-origin) so both mock
  params and real endpoints resolve locally.
- `npm run dev` → `http://localhost:PORT` with the full PWA + live `/api/*`.

## Alternatives considered

- `sam local start-api` — official, but needs Docker and is heavier/slower for a single handler.
- DynamoDB Local — offline testing without real data; overkill for now.

## Plan

- [x] Approach: Node wrapper (no Docker) + keys fetched from the deployed Lambda at startup.
- [x] Implement `dev/server.mjs` + `npm run dev` (root `package.json`, `@aws-sdk` dev deps).
- [x] Frontend localhost API base → same-origin (`file://` still uses the deployed URL).
- [x] Secrets: fetched at startup (nothing on disk); `.env`/`.env.local` already gitignored.

## How to run

```bash
aws sso login --profile havasu   # DynamoDB-backed endpoints need a live SSO session
npm install                      # once — installs @aws-sdk locally
npm run dev                      # -> http://localhost:8788
```

## Acceptance criteria

- [x] `npm run dev` serves the site + `/api/*` locally. NWS endpoints (`/api/forecast`,
      `/api/alerts`) and all `?mock=` states return real/mock data with no creds.
- [x] Mock params (`?demo=1`, `?mockWater=`, …) work locally.
- [x] No secrets committed (keys pulled from the Lambda config at runtime).
- [ ] DynamoDB-backed endpoints (`/api/current`, `/api/history`, live `/api/compare` &
      `/api/water`) verified — needs a fresh `aws sso login` (token was expired during the
      first test; not a code issue).
