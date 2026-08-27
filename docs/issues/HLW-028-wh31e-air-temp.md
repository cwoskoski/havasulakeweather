# HLW-028: WH31E shaded air temp — provision, verify, dual-temp display

- **Status:** in-progress (Phase 1 — provision & verify)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/79
- **Branch:** `feat/HLW-028-wh31e-air-temp`
- **PR:** _(opens with Phase 2 code)_
- **Created:** 2026-08-26

## Summary

Add the new **WH31E** wireless thermo-hygrometer (paired to the WS-2902D console on
**CH1** → `temp1f` / `humidity1f` / `batt1`) as a shade-shielded **true air temperature**,
while keeping the existing all-in-one array temp as the **"in the sun"** reading. Both
temps stay available.

The solar radiation shield hasn't arrived yet — and the shield is what makes the WH31E a
trustworthy air temp — so this is split into a verify-first phase (now, no deploy) and the
display cutover (later, gated on the shield + Phase 1 looking good).

## Motivation / context

The WS-2902 all-in-one array isn't aspirated and reads high in direct sun, so "current
temp" on the site currently drifts warm on sunny afternoons. A shaded WH31E gives a real
air temperature; keeping the array reading as an explicit "in the sun" number is actually
useful at a lake (dock/deck feel), so we surface both rather than replace one with the other.

## Plan

### Phase 1 — provision & verify (no deploy)

The ingest Lambda stores **every** posted field (no allow-list; only indoor
`tempinf`/`humidityin`/`battin` + `PASSKEY`/`dateutc` are dropped — `handler.js:96-99`),
so once the WH31E is paired, `temp1f`/`humidity1f`/`batt1` land in DynamoDB automatically —
stored as *strings* (they're not in the `NUMERIC` set) — with **no code change and no
deploy**. Nothing live reads those fields, so pairing can't break anything.

- [ ] Pair WH31E to the console on **CH1**; let it transmit a few minutes.
- [ ] Confirm the extra sensor appears in the Ambient Weather Network app.
- [ ] Confirm `temp1f`/`humidity1f` are present on the newest `OBS#…` DynamoDB item
      (read-only `dynamodb query`, no deploy).
- [ ] Sanity-check WH31E vs array `tempf` — close in shade; array reads high in sun.

### Phase 2 — dual temp (gated on radiation shield arriving + Phase 1 good)

Normal `feat/HLW-028` branch → PR → Chad merges (merge = deploy).

- [ ] `handler.js`: add `temp1f`/`humidity1f`/`batt1` to `NUMERIC` (store as numbers;
      old string-typed items coerced defensively on read).
- [ ] `read.js` `/api/current`: keep `temperatureF` (array), add `shadeTempF` (WH31E).
- [ ] `index.html`: primary big number = shaded air temp, "in the sun" chip = array temp;
      bump SW cache (`havasu-wx-vN`).
- [ ] Decide with the Phase 2 plan: does feels-like / dew point switch to the shaded
      sensor's temp+humidity? Does the history chart get a second line?
- [ ] Tests for the numeric parsing + read shaping.

## Acceptance criteria

- [ ] Phase 1: WH31E data is visible in DynamoDB and reads sensibly vs the array.
- [ ] Phase 2: the site shows both a shaded air temp and an "in the sun" temp; `npm test` green.

## Notes

- Channel → field mapping: the WH31E's channel dial (1–8) sets which `tempNf`/`humidityN`/
  `battN` it posts. **CH1 → `temp1f` / `humidity1f` / `batt1`.** `battN` is 1 = OK, 0 = low.
- The WS-2902D console supports up to 8 WH31 sensors, so more channels can be added later.
- Radiation shield is a hard prerequisite for the Phase 2 cutover — without it the WH31E
  also reads high in sun and there's no accuracy win over the array.
