# Architecture & Decisions

## Goal

Capture readings from a personal Ambient Weather station in Havasu Lake, CA, on
self-hosted infrastructure, as cheaply as possible. Phase 1 is data capture.
Phase 2 (later) is a mobile-friendly public page for the community.

Target cost: **~$0–2/month** plus ~$10–12/year for a domain.

## High-level shape

```
Ambient Weather console
      │  HTTP GET (plaintext, LAN)
      ▼
Raspberry Pi 4  (havasu-weather)
  ├─ Node ingest service ──► SQLite (WAL)
  │                             │
  │                             └─► Litestream ──► Cloudflare R2 (continuous backup)
  └─ (later) web: static page + JSON API ──► Cloudflare Tunnel ──► public, edge-cached
```

## Phase 1 — Ingest (building now)

- **Console → Pi over the LAN, plaintext HTTP.** The console speaks HTTP on port
  80 and cannot do TLS. On the LAN that's fine — no certificates, no
  TLS-termination workaround. This is the main reason to run on the Pi rather than
  point the console straight at a cloud HTTPS endpoint.
- **Node listener.** Small HTTP server; parses the query string into a map.
- **SQLite in WAL mode.** ~525k rows/year at 60s intervals — trivial for SQLite
  for a decade. One observations table.
- **Idempotent writes.** Unique constraint on (station id, dateutc); consoles
  retry, so replays must not duplicate. Insert-or-ignore.
- **Store two timestamps.** The console's `dateutc` *and* the Pi's receive time,
  as separate columns. Console clocks drift; when they disagree you'll want both,
  and the receive time can't be reconstructed later.
- **Parse into a map, log unknown keys.** The console only sends fields the
  hardware actually has, and Ambient's field naming has quirks. Never reject a
  payload for unknown fields — log them.
- **Non-root port.** Bind 8080 (or `setcap` for 80) so the service isn't root.

## Data format: Ambient vs Wunderground

The console's "Customized" upload can speak either protocol. Both are an HTTP GET
with a weather query string; the differences:

|                  | Ambient Weather format                                              | Wunderground format                        |
|------------------|--------------------------------------------------------------------|--------------------------------------------|
| Station id field | `PASSKEY` = station MAC                                             | `ID` + `PASSWORD`                          |
| Field set        | **Everything the hardware reports** (indoor, battery, extra sensors, AQ, lightning…) | WU-standard subset                         |
| Naming           | Ambient's native names                                             | WU PWS names (core names largely the same) |
| Extras           | —                                                                  | expects `action=updateraw`, replies `success` |

**Decision: use Ambient Weather format for our custom server.** We're building the
receiver ourselves, so we want the complete native field set and the MAC
(`PASSKEY`) as the natural device id / dedupe key. The richer format costs nothing
given we parse into a map and log unknown keys.

We confirm the exact fields empirically: step 1 of the ingest service just **logs**
whatever the console sends, so we design the schema from a real payload.

**Also keep the real AmbientWeather.net and Wunderground uploads enabled.** They're
independent settings on the console, cost nothing, and give a zero-effort backup
data path plus a sanity check against our own numbers during development.

## Storage & backup

- **SQLite over any cloud DB.** The workload is tiny; a managed time-series DB
  (Timestream, InfluxDB) is the wrong tool and/or an always-on cost.
- **Litestream → Cloudflare R2.** Continuous streaming replication of the SQLite
  file to object storage. R2 has a free tier and no egress fees; the DB will be
  tens of MB. Restoring after a Pi failure is one command — the difference between
  "lost three years of history" and a 15-minute rebuild.

## Hardware notes

- **Pi 4 Model B**, Raspberry Pi OS Lite (64-bit), Wi-Fi, hostname `havasu-weather`.
- **Booting from SD card for now.** Continuous small writes (SQLite + WAL + logs)
  wear out SD cards; plan to migrate to a USB SSD for endurance. Keep the Pi
  indoors / air-conditioned — Havasu summers thermal-throttle and age flash.
- **DHCP reservation** for the Pi on the router. The console stores whatever
  address you type and won't chase it if DHCP moves the Pi. Don't rely on mDNS
  (`.local`) for the console.

## Phase 2 — Public page (later, but designed for now)

- **Static HTML + two JSON endpoints** (`/api/current`, `/api/history?hours=24`).
  No framework — loads fast on a phone with two bars out on the lake. Charts via
  **uPlot** (a few KB, good on mobile).
- **Cloudflare Tunnel.** Free HTTPS, no port forwarding, works behind CGNAT /
  dynamic IP, never exposes the home IP.
- **Edge caching is the load-bearing trick.** Serve current conditions as small
  JSON with a 30–60s cache header. Cloudflare then absorbs essentially all
  community traffic — 5 or 500 viewers, the uplink sees ~1 request/minute.
- **Security for the open endpoint:** secret path segment + MAC allowlist checked
  before any write; rate limits to cap blast radius.
- **Disclaimer:** note it's a personal station, not an official observation —
  people may check wind before putting a boat in.

## Explicitly rejected

- **AWS Lambda / API Gateway / CloudFront / DynamoDB / Timestream** — unnecessary
  once the Pi ingests on the LAN; adds cost and the HTTPS-termination workaround.
- **Event sourcing / Axon** — this is a telemetry stream: append-only timestamped
  facts, no commands, aggregates, or invariants to protect. A table of
  observations gives everything event sourcing would, without the framework.
- **A web framework (Laravel/Vue) for the public page** — static + JSON is faster
  and simpler here.
