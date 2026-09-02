# HLW-048: Lightning (Ambient WH31L via Ecowitt GW1100) — ingest + display

- **Status:** **done** — shipped 2026-09-01. PRs #92 (POST-body ingest) + #93 (bolt meter + /rain page) merged & deployed; gated key deploy added the gateway PASSKEY to `AllowedStationKeys`; gateway rows storing every 60s; live site verified (bolt meter on the rain card, /rain.html live).
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/91
- **Branch:** `feat/HLW-048-lightning-ingest`
- **PR:** https://github.com/cwoskoski/havasulakeweather/pull/92 (Phase 1) + https://github.com/cwoskoski/havasulakeweather/pull/93 (full feature), both merged 2026-09-01
- **Created:** 2026-09-01

## Summary

Surface **lightning** on the site from an **Ambient WH31L** detector, received by an **Ecowitt
GW1100** gateway. The WS-2902 console can't take the WH31L (Ambient supports it only on
WS-2000/4000/5000/1965), so the GW1100 receives it and does a **Customized upload (Ecowitt
protocol)** to our existing ingest endpoint. We display strike distance / daily count / last strike.

## Why the gateway (decided)

- WH31L is **not** WS-2902-compatible (Ambient's own compat list). Confirmed.
- WH31L is Fine-Offset OEM (same lightning module as Ecowitt's WH57); Ecowitt GW1100/GW2000 are
  **widely reported** to receive it (community-confirmed, not vendor-guaranteed) → **pairing test first**.
- Alternative (rejected for now): an Ambient WS-2000/5000 console (official, but a pricier full
  console + routes via AmbientWeather.net → a new Ambient-API data path).

## Hardware (Chad)

1. Power the **GW1100** (USB) near Wi-Fi; add it in the Ecowitt app (join its hotspot → hand it 2.4 GHz Wi-Fi).
2. Batteries into the **WH31L**; confirm a lightning sensor appears in the app's **Sensors** list (pairing test).
3. App → gateway → **Weather Services → Customized**: protocol **Ecowitt**, server
   `dzn7sq96yz34g.cloudfront.net` (bare host), path `/data/report/?`, port `80`, interval 60 s.

## Build

- [x] **Phase 1 — ingest POST-body parsing (shipped in PR #92)** (`ingest/src/handler.js`): Ecowitt posts fields in the
      request **body** (urlencoded); today `parseParams` reads only GET query params (WS-2902 style).
      Parse `event.body` (decode base64 when `isBase64Encoded`) as a fallback between query-string and
      rawPath. Export `parseParams` + unit test (GET, POST body, base64, path-jammed). Build only — no
      deploy until the gateway posts. Ecowitt is HTTP-only; our ingest already takes HTTP :80.
- [x] **Phase 2 — captured**: gateway posting; fields `lightning` (km), `lightning_num` (today), `lightning_time` (epoch), `wh57batt` (the gateway IDs the WH31L as its WH57 twin). Gateway PASSKEY seen in logs (E819…).
- [x] **Phase 3 — built + previewed** (this PR):
      - `lightning.js`: pure helpers — 0–3 **bolt level** (quiet/distant/area/close via recency+proximity+rate,
        midnight-reset-safe strike counting), km→mi, mock scenarios.
      - `handler.js`: lightning fields → `NUMERIC`; **per-station rain watermark** (a shared mark would let
        two posting stations corrupt each other's rain detection).
      - `read.js`: `lightning` block on `/api/current` + new **`/api/lightning`** (`?hours=`, `?mock=quiet|distant|close`).
      - Home rain card: **0–3 bolt meter** (flickers at level ≥2, reduced-motion safe) + status line + **Storms →**.
      - **`/rain.html` "Rain & Storms"**: hero (rain + bolts), **range-ring strike display** (distance-only-honest),
        strikes/hour + distance-trend chart (24h), rainfall totals + dry streak, 7-day rain chances, **sky-flash**
        (random while active; fires on a real counter increment; reduced-motion off). SEO head, sitemap, footers, SW v41/r5.
      - Tests 85/85 (`lightning.test.mjs` + earlier suites).
- [x] **Shipped**: #93 merged (code deploy green) → gated key deploy (`sam deploy`, keys read back from live,
      gateway key appended) → verified: logs flipped `skip-unlisted`→`stored`, gateway rows in DynamoDB with
      numeric lightning fields, live `/api/current`+`/api/lightning` serving, bolt meter visible on the live rain
      card ("No lightning nearby · 8 today"). The 8 counted strikes were mounting/handling artifacts (last at
      4:21 PM during install); bolt level correctly stayed 0 and the counter resets at midnight.

## Notes

- WH31L is a **separate uploader** (its own PASSKEY) → its own `OBS#<key>` partition; the read side
  merges it into the display (the WS-2902 keeps posting the array + WH31E on its own key).
- 79-second transmit cadence; ~25-mile detection range; 2×AA (lithium recommended).
