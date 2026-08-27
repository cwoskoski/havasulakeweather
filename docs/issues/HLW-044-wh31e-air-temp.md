# HLW-044: WH31E shaded air temp — provision, verify, dual-temp display

- **Status:** in-progress — Phase 1 **DONE** 2026-08-26. Phase 2 (dual-temp UI) **built + previewed** 2026-08-26, PR open; the live deploy stays gated on the radiation shield arriving + Chad's merge.
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/79
- **Branch:** `feat/HLW-044-wh31e-air-temp`
- **PR:** _(renumbered from HLW-028; new draft PR below)_
- **Created:** 2026-08-26

## Summary

Add the new **WH31E** wireless thermo-hygrometer (paired to the WS-2902D console on
**CH1** → `temp1f` / `humidity1` / `batt1`) as a shade-shielded **true air temperature**,
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
so once the WH31E is paired, `temp1f`/`humidity1`/`batt1` land in DynamoDB automatically —
stored as *strings* (they're not in the `NUMERIC` set) — with **no code change and no
deploy**. Nothing live reads those fields, so pairing can't break anything.

- [x] Pair WH31E to the console on **CH1**; let it transmit a few minutes.
- [x] Confirm `temp1f`/`humidity1`/`batt1` are present on the newest `OBS#…` DynamoDB
      item (read-only `dynamodb query`, no deploy). **Verified 2026-08-26** — CH1 began
      landing at `2026-08-27T00:35:33Z` (UTC) and has appeared on **every** reading since
      (~1/min), not intermittently.
- [x] Sanity-check WH31E vs array `tempf`. Sensor sitting **indoors** at check time:
      `temp1f` ≈ 85°F, `humidity1` ≈ 30%, `batt1` = 1 (OK), vs array `tempf` ≈ 116°F —
      the ~30° gap confirms two independent sensors. (Will move to shade by the station
      next, then into the shield when it arrives.)

### Phase 2 — dual temp (gated on radiation shield arriving + Phase 1 good)

Normal `feat/HLW-044` branch → PR → Chad merges (merge = deploy).

- [x] `handler.js`: `temp1f`/`humidity1`/`batt1` added to `NUMERIC` (future writes store as
      numbers; `read.js` coerces old string items via `toNum`).
- [x] `read.js`: `/api/current` adds `shadeTempF`/`shadeHumidity`/`shadeFeelsLikeF`/`shadeDewPointF`
      (array `temperatureF` kept as "Full Sun"); `shadeTempF` also added to `/api/history` and `/api/compare`.
- [x] `index.html`: hero = **Solar Shielded** primary + smaller **Full Sun** secondary; 24h Range
      keyed to the shielded series; **dual-line** history chart (Shielded + Full Sun) with legend +
      single-line fallback; Station check shows Temp (shade) + Temp (sun), both vs the neighbor. SW → `v38` + `RELEASE` r2 (user-facing → update toast).
- [x] Decisions: feels-like follows the shielded primary; dew point + humidity stay on the array
      (shielded/array humidity match closely); history chart got the second line. Primary caption: "SOLAR SHIELDED".
- [x] Tests: `ingest/test/read.test.mjs` covers `toNum` coercion; `npm test` 57/57 green.

## Acceptance criteria

- [x] Phase 1: WH31E data is visible in DynamoDB and reads sensibly vs the array.
- [x] Phase 2 (built): the page shows both a shielded air temp and a Full Sun temp; `npm test` 57/57 green. Live cutover pends the shield + merge.

## Notes

- Channel → field mapping: the WH31E's channel dial (1–8) sets which `tempNf`/`humidityN`/
  `battN` it posts. **CH1 → `temp1f` / `humidity1` / `batt1`.** `battN` is 1 = OK, 0 = low.
- The WS-2902D console supports up to 8 WH31 sensors, so more channels can be added later.
- Radiation shield is a hard prerequisite for the Phase 2 cutover — without it the WH31E
  also reads high in sun and there's no accuracy win over the array.
- **Field-name correction (from Phase 1):** extra-sensor humidity posts as **`humidity1`**
  (no `f`), not `humidity1f`; temp is `temp1f`, battery `batt1`. All three currently land
  as **strings** (not in the ingest `NUMERIC` set) — harmless (nothing live reads them),
  and Phase 2 will number-cast them and coerce old string items defensively on read.
- **Renumbered HLW-028 → HLW-044:** the branch was first opened off a stale local `main`
  and given HLW-028, which was already the merged SEO ticket (`HLW-028-seo-improvements.md`).
  Rebased onto the real `origin/main` (HLW-043 was the latest; 044 is the next free number),
  the ticket/branch/issue/PR renumbered to HLW-044, and SW re-bumped over the real `v37`.
