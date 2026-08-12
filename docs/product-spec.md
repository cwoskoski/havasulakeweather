# Product Spec — Havasu Lake Weather

The application design (the *what*). Infrastructure/deploy sequencing lives in
[plan.md](plan.md); the system design and rationale in [architecture.md](architecture.md).

## Overview

A public, mobile-first web page showing **live outdoor conditions** from a personal
Ambient Weather **WS-2902D** station in Havasu Lake, CA, plus history charts. Backed
by the serverless ingest pipeline; edge-cached so any community-scale audience is
cheap to serve.

## Users & goals

- **Primary:** Havasu Lake residents and lake-goers checking conditions now — the two
  headline needs are **wind** (boating/watersports) and **temperature/heat** (desert
  summer).
- **Secondary:** anyone wanting recent history/trends.
- **Owner:** reliable capture of all station data + a light, optional donation ask to
  offset running costs.

## Scope

- **Display: outdoor conditions only.** Indoor temp/humidity are never shown.
- **Ingest: store the full outdoor field set only.** Indoor console readings
  (`tempinf`, `humidityin`) are dropped at ingest, not persisted. **Barometric pressure
  is kept** — it's measured by the console but is an atmospheric/weather metric, not an
  "indoor" reading. Unknown/new fields are still stored (logged, never rejected) so a
  future add-on sensor isn't silently lost.

## Data

### Captured (stored) — outdoor field set
Every outdoor field the console posts (Ambient format), stored as a map keyed by
station MAC + `dateutc`. Indoor console readings (`tempinf`, `humidityin`) are dropped;
everything else — including unknown/new fields — is stored (logged, never rejected).
Exact field names confirmed from the first real payload.

### Displayed — outdoor subset
| Metric                         | Expected field                                   |
|--------------------------------|--------------------------------------------------|
| Temperature                    | `tempf`                                          |
| Humidity                       | `humidity`                                       |
| Wind speed / gust / max gust   | `windspeedmph` / `windgustmph` / `maxdailygust`  |
| Wind direction                 | `winddir`                                         |
| Rain rate                      | `rainratein`                                     |
| Rain today / week / month / total | `dailyrainin` / `weeklyrainin` / `monthlyrainin` / `totalrainin` |
| Solar radiation                | `solarradiation`                                 |
| UV index                       | `uv`                                             |
| Barometric pressure (relative) | `baromrelin`                                     |

### Derived (computed)
- **Feels-like** — heat index (≥80°F) / wind chill (≤50°F)
- **Dew point**
- **24h high/low** (temp, gust)
- **Pressure trend** — Δ over ~3h → rising / steady / falling (poor-man's storm signal)
- **Wind direction** as compass (N/NE/…)
- **Raining now?** + **`lastRainAt`** — see below

### Rain — "is it raining right now?"
The single most-asked question in a small community. Monthly/annual totals are
secondary; the headline is a live **Raining / Dry** status.

- **Primary signal:** `rainratein` (instantaneous rate, in/hr) > 0 → raining now.
- **More robust signal:** watch the cumulative counters (`eventrainin`, `hourlyrainin`,
  `dailyrainin`) between readings — any increment is a bucket tip (0.01") = rain. Light
  drizzle can read `rainratein = 0` *between* tips, so counter-increment catches what
  the rate misses. Ingest computes/stores a **`lastRainAt`** timestamp on any increment.
- **Displayed:** the rain tile leads with **Raining now** (rate + light/moderate/heavy)
  or **Dry (last rain N ago)**; today's total is secondary; month/total tertiary.
- **Latency (keep it live):** onset lag = console upload interval + CDN cache TTL +
  client poll. Use a short console interval and a short `/api/current` cache (~20–30s)
  so "it just started raining" shows within ~a minute.

## Features

### 1. Live current conditions
- **Hero (above the fold on a phone):** big **Temp + feels-like** and **Wind
  speed/gust + direction**. Glanceable.
- **Tiles:** UV/sun · Rain today + rate · Humidity/dew point · Pressure + trend ·
  24h high/low.
- **Freshness:** "updated Ns ago", plus a clear **stale/offline** state if the station
  hasn't reported in a few minutes.

### 2. Live updates (no full refresh)
- Client polls the edge-cached `/api/current` every ~30–60s (aligned to the station's
  report cadence + the CDN cache TTL).
- **Only changed values repaint** in the DOM, with a subtle highlight; unchanged fields
  don't flicker.
- **No WebSocket/server push** — data changes ~once a minute, so polling the cached
  endpoint stays fully serverless and free. Revisit only if sub-minute updates are ever
  wanted.

### 3. History
- Charts (uPlot): default **last 24h**, toggle **7d** (30d later, maybe). Metrics:
  temperature, wind (speed + gust), rain; others secondary.
- Reads `/api/history`.

### 4. History backfill (so charts aren't empty at launch)
- **Preferred source: the AmbientWeather.net API.** If the station has been reporting
  to AWN, that's *your own station's real history*, pullable via the AWN REST API (needs
  your **API key + application key**). One-time import into DynamoDB, matching our schema.
- **Fallback:** a third-party historical source (Open-Meteo / NWS) for the Havasu area —
  approximate and from a different sensor, so only if AWN history isn't available.

### 5. Donation (optional — design TBD)
- A small, tasteful **donate ask**: a dismissible splash/modal on first visit + a
  persistent small button.
- **"Don't show again if they've donated"** without accounts: set a `localStorage` flag
  when the visitor returns from a **successful payment** (separate "maybe later" flag for
  dismissals). Per-device and resettable — good enough here; true cross-device donor
  tracking would need logins (out of scope).
- **Payment: a hosted link — no backend, no PCI scope.** Stripe Payment Link (most
  control over the success redirect, which is what sets the "donated" flag), or
  Ko-fi / Buy Me a Coffee. Provider TBD.
- Open: how aggressive the splash is; provider; whether "donated" is strict or just
  "dismissed."

### 6. Footer / trust
- "Personal WS-2902D station — not an official observation."
- A note on where the station is located.

## UX

- **Mobile-first, responsive up to desktop.**
- Imperial units (°F, mph, in, inHg) for a US audience; optional metric toggle later.
- Fast: static HTML + tiny JS, edge-cached — loads on a weak lake signal.

## API contract (draft)

- `GET /api/current` → latest reading + derived values + `stale` flag. Cache 30–60s.
- `GET /api/history?range=24h|7d` → arrays for charting. Cache a few minutes.

Exact JSON shapes finalized once we see real field names (Phase 1 logger).

## Non-functional

- **Cost target: stay in the AWS free tier.** ~1,440 writes/day sits far inside
  always-free limits for Lambda, DynamoDB, and CloudFront. DynamoDB storage is the only
  thing that grows (~0.5 GB/year vs. 25 GB free = years of headroom).
- **Budget alarms (required):** AWS Budgets with email alerts *well before* anything
  bills — a low monthly threshold plus forecasted-to-exceed notifications.
- **Retention:** keep everything, no TTL (revisit only if storage ever nears the
  free-tier ceiling — years away).
- **Security:** ingest locked to CloudFront + MAC allowlist; public read endpoints are
  read-only and cached.
- **Scale:** the CDN absorbs traffic spikes (a link passed around town on a windy day).

## Open decisions

- **DynamoDB capacity mode:** on-demand (simplest, absorbs the history backfill burst,
  ~pennies/mo) vs. provisioned within the 25 WCU/25 RCU always-free allotment (strict
  $0, but the backfill import must be throttled). Leaning on-demand + budget alarms,
  matching the "aim for free tier, alarm on surprises" posture.
- **Donation:** provider (Stripe Link / Ko-fi / BMC), splash aggressiveness, strict
  "donated" vs. just "dismissed."
- **History backfill:** is the station already on AmbientWeather.net, and do you have
  the AWN API + application keys?
- **History depth** (7d vs 30d) and which metrics get charts.
- **Custom domain: `havasulakeweather.com`** — chosen. Register via Route 53 (needs
  registrant contact info); ACM cert in us-east-1 for CloudFront at the public-page phase.
