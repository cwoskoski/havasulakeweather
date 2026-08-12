# Architecture & Decisions

## Goal

Capture readings from a personal Ambient Weather station in Havasu Lake, CA, into
a cheap **serverless AWS** backend. Phase 1 is data capture. Phase 2 (later) is a
mobile-friendly public page for the community. Target cost: **~$0–2/month**.

## Why not a Raspberry Pi (we pivoted)

We first planned a Pi-on-the-LAN receiver, then pivoted to fully serverless. The Pi
is an extra failure point living in the house, and — crucially — CloudFront can
accept the console's plaintext HTTP directly, so no local box is needed to bridge
to HTTPS. **Tradeoff accepted:** no local store-and-forward buffer, so if the
internet drops, those readings are lost. Fine for this use.

## The plaintext-HTTP constraint (the crux)

The Ambient console posts **plaintext HTTP on port 80** and cannot do TLS. AWS
API Gateway and Lambda URLs are HTTPS-only. **CloudFront is the bridge:** its
viewer protocol policy accepts HTTP on port 80 at the edge and re-originates to the
backend over HTTPS. The console thinks it's talking plain HTTP; everything behind
the edge is encrypted.

## High-level shape

```
Ambient console ──HTTP :80──▶ CloudFront ──HTTPS──▶ Lambda (Node 24) ──▶ DynamoDB
                              accepts HTTP,          parse query,        one table,
                              CachingDisabled,       MAC allowlist,      idempotent
                              forward query strings  dedupe              writes
```

- **CloudFront** — viewer policy allows HTTP (the whole trick), `CachingDisabled`,
  forwards *all* query strings (weather data rides in the query string). The free
  `*.cloudfront.net` host serves port 80, so no domain is needed to start.
- **Lambda (Node 20)** — parses the query into a map, checks the station MAC against
  an allowlist, writes to DynamoDB with a conditional put (idempotent — consoles
  retry). Reserved concurrency caps blast radius.
- **DynamoDB** — partition key `MAC#YYYY-MM-DD`, sort key `dateutc`, on-demand.
  ~1,440 writes/day is pennies. "Latest" and "last 24h" are single queries.

## Data format: Ambient vs Wunderground

The console's "Customized" upload can speak either protocol. Both are an HTTP GET
with a weather query string; the differences:

|                  | Ambient Weather format                             | Wunderground format                        |
|------------------|----------------------------------------------------|--------------------------------------------|
| Station id field | `PASSKEY` = station MAC                             | `ID` + `PASSWORD`                          |
| Field set        | **Everything the hardware reports**                | WU-standard subset                         |
| Extras           | —                                                  | expects `action=updateraw`, replies `success` |

**Decision: Ambient Weather format.** We own the receiver, so we want the complete
native field set and the MAC (`PASSKEY`) as the device id / dedupe key. Confirmed
empirically in Phase 1 — the logger Lambda prints a real payload before we design
the table. Keep AmbientWeather.net + Wunderground uploads on as a free backup.

## Storage & retention

- **DynamoDB, single table, on-demand.** No server, no idle cost. Storage is free
  under 25 GB (~50 years at ~0.5 GB/year).
- **Key design (scales for years):** time-series item is `pk = OBS#<stationKey>#YYYY-MM`,
  `sk = <dateutc ISO>`. Month buckets keep any one partition small, and typical reads
  (current / 24h / 7d) hit a single partition. Each item carries `rainingNow` +
  `lastRainAt`, so "current conditions" is just the newest item — no separate pointer.
- **Watermark pattern (cheap writes):** the console posts every ~60s, so the Lambda
  stays warm and holds the last reading in memory. Steady state is **one DynamoDB write
  per reading** — no read on the hot path; only a cold start does a seed query.
- **Idempotency:** conditional put (`attribute_not_exists(pk)`) on the composite key, so
  retries never duplicate.
- **Two timestamps:** the console's `dateutc` *and* the server `receivedAt`.
- **Rain-now:** the WS-2902D sends no rain *rate*, so "raining now / last rain" is derived
  from the monotonic `totalrainin` counter incrementing between readings.
- **Indoor dropped:** `tempinf`/`humidityin` are not stored.
- **Retention:** keep everything (no TTL). If it ever grows large (years out), roll old
  months to S3/Parquet + Athena. On-demand, no PITR → ~$0.15/month.

## Security

- **Lock the Function URL to CloudFront** (OAC / `AWS_IAM`) so it can't be hit
  directly, bypassing the edge.
- **Secret path segment + MAC allowlist** checked before any write.
- **Reserved concurrency** (~5) + an **AWS Budgets alarm** to cap blast radius/cost.

## Phase 2 — public page (later, designed for now)

- **Static HTML + JSON endpoints** (`/api/current`, `/api/history?hours=24`) on
  S3 + CloudFront. No framework — fast on a phone with two bars on the lake. Charts
  via **uPlot**.
- **Edge caching is the load-bearing trick.** Small JSON with a 30–60s cache header;
  CloudFront absorbs community traffic so origin sees ~1 request/minute regardless.
- **Custom domain + ACM cert** (cert must be in **us-east-1** for CloudFront).
- **Disclaimer:** personal station, not an official observation.

## Tooling

- **IaC: AWS SAM** (`template.yaml`). CloudFront is added as a raw CloudFormation
  resource (SAM is a CloudFormation superset).
- **Runtime: Node.js 24.**
- **Region: us-west-2.** Deploys pinned to the personal `havasu` profile via
  `samconfig.toml` so they can never target a work account.

## Explicitly rejected

- **Any always-on server** (EC2/Lightsail/VPS — and the Pi) — reintroduces a box to
  manage and a standing cost.
- **Timestream / InfluxDB** — wrong tool and/or always-on cost for 1,440 rows/day.
- **Event sourcing / Axon** — this is a telemetry stream: append-only timestamped
  facts, no commands or invariants. A table of observations suffices.
- **A web framework for the public page** — static + JSON is faster and simpler.
