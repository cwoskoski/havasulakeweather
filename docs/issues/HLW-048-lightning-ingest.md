# HLW-048: Lightning (Ambient WH31L via Ecowitt GW1100) — ingest + display

- **Status:** in-progress — Phase 1 (ingest POST-body parsing) building; hardware + display pending.
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/91
- **Branch:** `feat/HLW-048-lightning-ingest`
- **PR:** _(opens once the gateway is posting; Phase 1 build waits on the branch)_
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

- [ ] **Phase 1 — ingest POST-body parsing** (`ingest/src/handler.js`): Ecowitt posts fields in the
      request **body** (urlencoded); today `parseParams` reads only GET query params (WS-2902 style).
      Parse `event.body` (decode base64 when `isBase64Encoded`) as a fallback between query-string and
      rawPath. Export `parseParams` + unit test (GET, POST body, base64, path-jammed). Build only — no
      deploy until the gateway posts. Ecowitt is HTTP-only; our ingest already takes HTTP :80.
- [ ] **Phase 2 — capture** (after GW1100 posts): read the raw payload from the ingest logs → exact
      lightning field names + the gateway PASSKEY (empirical, like WH31E's `temp1f`).
- [ ] **Phase 3 — surface**: add the gateway key to `ALLOWED_STATION_KEYS`; read the newest lightning
      reading; show strike distance / daily count / "last strike NN min ago" on the site.

## Notes

- WH31L is a **separate uploader** (its own PASSKEY) → its own `OBS#<key>` partition; the read side
  merges it into the display (the WS-2902 keeps posting the array + WH31E on its own key).
- 79-second transmit cadence; ~25-mile detection range; 2×AA (lithium recommended).
