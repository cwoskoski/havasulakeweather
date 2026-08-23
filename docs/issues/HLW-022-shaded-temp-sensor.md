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

### Phase 2 — WH31L lightning (BLOCKED on hardware)
- Requires a GW1100/GW2000 gateway or WS-2000/WS-5000 console (a second uploader). **Decision
  needed** (see below). Schema designed now, ingest/UI deferred until the hardware exists.
- Fields to store (normalize distance to km; store source protocol to resolve the unit trap):
  - Ecowitt gateway: `lightning` (km)→`lightningDistanceKm`, `lightning_num`→`lightningCountDay`,
    `lightning_time` (epoch s)→`lightningLastStrikeAt`, `wh57batt`.
  - WS-2000/5000 (AWN): `lightning_distance` (**miles if wind=mph**)→convert→`lightningDistanceKm`,
    `lightning_day`→`lightningCountDay`, `lightning_time`→`lightningLastStrikeAt`, `batt_lightning`.

## Open decision

- **Lightning path:** buy a **GW1100/GW2000 gateway** (cheapest 2nd uploader, Ecowitt fields),
  add a **WS-2000/WS-5000 console** (Ambient-native), or **defer/return the WH31L**? This drives
  whether Phase 2 happens at all and what field mapping we build.

## Acceptance criteria

- [ ] WH31E on CH1 in the WH31-SRS; `temp1f`/`humidity1` confirmed landing in DynamoDB (CloudWatch).
- [ ] `/api/current` returns a canonical shaded temp (fallback to array sensor).
- [ ] Home page headline temp = the accurate shaded reading; 0 console errors.
- [ ] Lightning: schema + ingest gated on the hardware decision (Phase 2).

## Notes

- Can't build/verify Phase 1 until the WH31E arrives (Wed) and is paired + reporting.
- Sun-inflated fix is real: the shaded reading will read lower (true air temp) during the day.
