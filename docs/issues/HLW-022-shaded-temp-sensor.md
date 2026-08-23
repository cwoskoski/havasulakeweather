# HLW-022: Integrate WH31E shaded-temp sensor (+ lightning: blocked, research parked)

- **Status:** proposed (research done; Phase 1 pending hardware arrival)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/35
- **Branch:** `feat/HLW-022-shaded-temp-sensor`
- **PR:** —
- **Created:** 2026-08-23

## Summary

New Ambient sensors to fix the sun-inflated temperature reading and (later) add lightning:
- **WH31E** thermo-hygrometer (arrives Wed) — extra channel; mount in the shield for a true
  shaded air temperature. **Fully compatible with the WS-2902D.**
- **WH31-SRS** solar radiation shield (arrives Fri) — passive housing for the WH31E; no data,
  just an accurate reading. The standard fix for a thermometer reading high in direct sun.
- **WH31L** lightning detector (arrives Aug 31) — **NOT compatible with the WS-2902D** (see below).

## Research findings (verified)

- The WS-2902D console uploads via the **Ambient (AWN) protocol only** (no Ecowitt option). Our
  ingest already stores every posted field except the indoor `DROP` set, so add-on channels land
  automatically once paired — no new API.
- **WH31E:** pairs to the WS-2902D as one of up to **8 channels (CH1–CH8)**, set by a DIP switch
  in the battery bay. AWN fields: `tempNf` (°F), `humidityN` (%), `battN` (1=OK/0=Low). NB: WH31
  sensors don't render on the LCD console — they pass straight through to the upload.
- **WH31-SRS:** passive shield, no pairing, no data. Houses the WH31E; reflective plates + natural
  convection → true shaded air temp.
- **WH31L:** the WS-2902/2902D **cannot pair with or upload it** (Ambient FAQ is explicit; the
  "for WS-2000/WS-5000" restriction is real). Receiving lightning needs a **second uploader** —
  a **GW1100/GW2000 gateway** (Ecowitt fields) or a **WS-2000/WS-5000 console** (AWN fields) — on
  a separate HTTP POST. Not solvable in software on the current station.

## Plan

### Phase 1 — WH31E shaded temperature (unblocked; do once it's reporting)
- **Hardware:** set the WH31E DIP switch to **CH1**; mount it in the WH31-SRS, shaded and
  freely ventilated, ~1.25–2 m up, away from walls/concrete/AC exhaust.
- **Ingest (`handler.js`):** add `temp1f`, `humidity1`, `batt1` to the `NUMERIC` set (they're
  already stored as strings otherwise). No `DROP` change — these are outdoor.
- **Read API (`read.js`):** expose the WH31E channel as the **canonical** temperature/humidity
  (`shadedTempF` / `shadedHumidity`), falling back to the array `tempf`/`humidity` when the
  channel is absent. Keep the array reading available as a secondary "in full sun" value.
- **Page:** headline temperature = the shaded reading (the accurate one). Decide at preview
  whether to also show the in-sun array reading as a small comparison.

### Phase 2 — WH31L lightning via a GW1100 gateway (DECIDED; hardware pending)
Lightning path = **Ecowitt GW1100** gateway (~$40) as a second uploader. Order it; expect
cross-brand pairing to usually work (WH31L is a Fine-Offset WH57 equivalent) — if it won't
pair, the fallback is an Ecowitt WH57 or a WS-2000/5000 console.

- **Ecowitt fields (distance already in km — no unit conversion):**
  `lightning` (km) → `lightningDistanceKm`, `lightning_num` → `lightningCountDay`,
  `lightning_time` (epoch s) → `lightningLastStrikeAt`, `wh57batt` → battery.
- **Second-uploader handling (the real work):** the GW1100 posts a **separate** HTTP request
  with its **own PASSKEY** (Ecowitt = uppercase MD5 of the gateway MAC) and it will also relay
  any other sensors it hears (main array, WH31) — risking duplicate obs.
  - Add the gateway's PASSKEY to `ALLOWED_STATION_KEYS`.
  - Store the gateway feed under its **own station key** (separate `pk`) so it doesn't collide
    with the WS-2902 series; the read API pulls **lightning only** from the gateway feed while
    temp/wind/etc. stay sourced from the WS-2902. (Alternatively point the GW1100 at a distinct
    path.) Decide at build.
  - Ecowitt POSTs use different field names than AWN — parse lightning defensively.
- **Page/API:** a lightning indicator (last strike distance + time + today's count), likely a
  tile or a transient banner when a strike is recent/close. Design when the gateway is in hand.

## Decision — resolved

- **Lightning path: GW1100 Ecowitt gateway** — **purchased, arriving Wed** (same as the WH31E).
  (Chosen over GW1200BU/GW2000: the GW1200 adds no weather-sensor capacity — identical channel
  counts, no display on any of them; GW2000 only matters for external-antenna range / Ethernet.
  All upload via the same Ecowitt customized protocol, so our ingest is unchanged regardless.)

## Rollout timeline

| When | Arrives | Do |
|---|---|---|
| **Wed** | WH31E + GW1100 | WH31E → **CH1**, batteries in (console registers it → `temp1f`/`humidity1` start posting). GW1100 → power + Wi-Fi; point its **customized-server** upload at our CloudFront endpoint (Ecowitt), note its **PASSKEY**. Its posts are *rejected* until we add that key — so no accidental duplicate feed. |
| **Fri** | WH31-SRS shield | Mount the WH31E inside it, shaded/ventilated → true air temp. Then build **Phase 1**. |
| **Aug 31** | WH31L | Pair to the GW1100; lightning starts flowing → build **Phase 2** (add GW1100 key to allow-list, store under its own station key, surface lightning). |

Note: the GW1100 will overhear the main array + WH31E and try to upload them too — but because
its PASSKEY isn't allow-listed until Phase 2, none of that is stored, so no dedup problem exists
before lightning is real. When we do allow it, we store its feed under a separate `pk` and pull
**lightning only** from it.

## Acceptance criteria

- [ ] WH31E on CH1 in the WH31-SRS; `temp1f`/`humidity1` confirmed landing in DynamoDB (CloudWatch).
- [ ] `/api/current` returns a canonical shaded temp (fallback to array sensor).
- [ ] Home page headline temp = the accurate shaded reading; 0 console errors.
- [ ] Lightning: schema + ingest gated on the hardware decision (Phase 2).

## Notes

- Can't build/verify Phase 1 until the WH31E arrives (Wed) and is paired + reporting.
- Sun-inflated fix is real: the shaded reading will read lower (true air temp) during the day.
