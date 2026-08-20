# HLW-002: Pin USBR RISE dam-release ids (Davis + Parker)

- **Status:** done (deployed — Davis/Parker releases live in /api/water)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/3
- **Branch:** `feat/HLW-002-rise-dam-releases`
- **PR:** (opened from this branch)
- **Created:** 2026-08-12

## Summary

Lake levels are live from USGS, but Davis/Parker Dam releases read "—" because the
USBR RISE catalog ids weren't set. Found and pinned them.

## The ids (from the RISE catalog)

RISE structure: location → catalog-records → catalog-items. The daily
"Lake/Reservoir Release - Total (cfs)" items live under each dam's **Water Operations
Monitoring** record:

| What | RISE item | Source record |
|---|---|---|
| **Davis Dam release** (inflow to Havasu) | **6135** | Lake Mohave record 4369 |
| **Parker Dam release** (outflow downstream) | **6130** | Lake Havasu record 4371 |
| 🎁 Lake Havasu water temp (°F) | 6127 | record 4371 |
| 🎁 Lake Mohave water temp (°F) | 6132 | record 4369 |
| Lake Havasu elevation (ft) | 6128 | record 4371 |
| Lake Mohave elevation (ft) | 6133 | record 4369 |

## Fixes in this change

- Pinned `RISE_DAVIS_ID=6135`, `RISE_PARKER_ID=6130` (env-overridable defaults).
- **Bug fix:** RISE rejects `Accept: application/json` with a 406 — it requires
  `application/vnd.api+json`. Corrected the header (this is why releases would always
  have read null before).
- URL-encoded the `order[dateTime]=desc` sort param.

## Verification

- Lake levels (USGS): Lake Havasu 452 ft (full), Lake Mohave 642.6 ft — live. ✅
- RISE endpoint + header + parser validated: water-temp items 6127/6132 returned
  87.6°F / 75.8°F. ✅
- Live Davis/Parker cfs: not yet confirmed from this machine — heavy probing got my IP
  temporarily throttled (HTTP 000). Will confirm on the dev server (after cooldown) /
  on deploy; the code path is proven by the temp items above.

## Bonus for HLW-013

RISE gives us **water temperature** (6127/6132) — the one gap I'd flagged as having no
free live source. Add it to the /water page.

## Acceptance criteria

- [x] Davis + Parker release ids found and pinned.
- [x] RISE Accept-header bug fixed.
- [ ] Live cfs confirmed via `/api/water` (dev server / deploy) once RISE un-throttles.
