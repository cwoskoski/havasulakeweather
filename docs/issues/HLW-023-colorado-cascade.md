# HLW-023: Extend /water to the full Colorado cascade (Powell → Grand Canyon → Mead) + history

- **Status:** in-progress — Phase 1+2 deployed 2026-08-23 (PR #37); Phase 3 backfill next
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/36
- **Branch:** `feat/HLW-023-colorado-cascade`
- **PR:** —
- **Created:** 2026-08-23

## Summary

Extend the /water page up the Lower Colorado from the two lakes it shows today (Havasu,
Mohave) to the **whole cascade**: Lake Powell → Glen Canyon Dam → Grand Canyon river →
Lake Mead → Hoover Dam → (Mohave → Davis → Havasu → Parker). Plus **deep historical
backfill** for the new points (like HLW-017 did for Havasu/Mohave).

## Verified data sources (free, no key)

USBR RISE items (fetch date-scoped to avoid the 90-yr hang; `accept: application/vnd.api+json`):

| Reservoir | Elevation (ft) | Storage (af) | Total release (cfs) | Live sample |
|---|---|---|---|---|
| **Lake Powell** (Glen Canyon) | `508` | `509` | `4315` | 3,519 ft · 7,684 cfs |
| **Lake Mead** (Hoover) | `6123` | `6124` | `6125` | 1,039 ft · 6.93M af · 4,871 cfs |

USGS gages (waterservices.usgs.gov, param 00060 cfs) for the Grand Canyon reach:

| Gage | Site | Live | Record from |
|---|---|---|---|
| Colorado R. **at Lees Ferry** (just below Glen Canyon Dam) | `09380000` | 7,970 cfs | 1921 |
| Colorado R. **near Grand Canyon** | `09402500` | 7,530 cfs | ~1922 |
| Colorado R. abv Diamond Creek nr Peach Springs | `09404200` | 8,350 cfs | recent |

- **Water temp availability (verified):** Havasu ✓ (RISE 6127), Mohave ✓ (RISE 6132),
  **Grand Canyon / Lees Ferry ✓** (USGS 09380000 param 00010, ~69°F). **Mead ✗, Powell ✗** —
  RISE has no reservoir water-temp for those two. So the reach gage = **Lees Ferry 09380000**
  (gives flow *and* the cold below-the-dam temp); Mead/Powell show elevation + storage only.
- Existing (unchanged): Havasu/Mohave elevation (USGS), storage/temp (RISE 6129/6134/6127/6132),
  Davis release 6135, Parker release 6130.

## Plan (phased)

### Phase 1 — live data (`water.js` + ingest)
- Add RISE consts: Mead 6123/6124/6125, Powell 508/509/4315; USGS Lees Ferry 09380000 (+ near
  Grand Canyon 09402500 as the canyon reach).
- `getLive()` fetches the new reservoirs + canyon flow (all soft-failing, date-scoped).
- Restructure the response into a **cascade** (ordered Powell→Havasu) of `reservoirs` and
  `reaches`, keeping back-compat fields (`lake`, `upstream`, `inflow`, `outflow`) for the
  current home teaser.
- `water-ingest.js`: extend the daily `WATER#DAILY` snapshot with `meadElevFt/meadStorageAf/
  hooverCfs`, `powellElevFt/powellStorageAf/glenCanyonCfs`, `leesFerryCfs` (+ `grandCanyonCfs`).

### Phase 2 — /water page redesign (the cascade view)
- Present the system top→bottom as a **river cascade**: each reservoir a card (elevation,
  storage acre-ft, % of full pool, low/normal/high vs history per HLW-018), each dam release /
  river reach a flow row between them. Design direction chosen below.

### Phase 3 — historical backfill (HLW-017-style)
- RISE daily history for Mead (from ~1935) + Powell (from ~1963): storage, elevation, release.
- USGS daily-values (dv) for the canyon gages (Lees Ferry from 1921).
- Write into the existing `WATER#DAILY` rows (add the new fields per date); extend
  `build-history-stats.mjs` so the new reservoirs get the same "vs history" context.

## Open decision

- **Page layout** for a now much taller page (3 lakes + 2 river reaches + Mohave/Havasu) —
  see the design options in the chat.

## Acceptance criteria

- [x] `/api/water` returns Mead + Powell + Grand Canyon reach (live), soft-failing.
- [x] Daily snapshots store the new fields (Powell/Mead/canyon).
- [x] /water shows the full cascade; 0 console errors. **Deployed + prod-verified** —
      Powell 21% · Mead 27% · Mohave 97% · Havasu 86%; Grand Canyon 70°F.
- [x] Deploy: ingest + read Lambda + site (SW v21); ran one ingest so `/api/water` serves
      `source: stored` with the upstream fields.
- [ ] **Phase 3 (next):** backfill decades of history (Mead/Powell/Lees Ferry) + vs-history
      context for the new reservoirs.

## Notes

- Big feature — phase it: live+ingest first, then page, then backfill. Backfill is large
  (Mead ~33k days, Powell ~23k, canyon gages ~38k) but tiny/cheap in DynamoDB.
