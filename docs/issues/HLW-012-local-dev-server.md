# HLW-012: Local dev — run the read API locally against real data

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/14
- **Branch:** `feat/HLW-012-local-dev-server`
- **PR:** (open when the work is ready)
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

- [ ] Confirm approach (Node wrapper vs SAM local; `.env.local` vs fetch-at-startup).
- [ ] Implement `dev/server.mjs` + `npm run dev`.
- [ ] Frontend localhost API base → same-origin local server.
- [ ] `.gitignore` the env file; document the required vars in README/CLAUDE.md.

## Acceptance criteria

- [ ] `npm run dev` serves the site + all `/api/*` locally against real data.
- [ ] Mock params (`?demo=1`, `?mockWater=`, …) work locally.
- [ ] No secrets committed.
