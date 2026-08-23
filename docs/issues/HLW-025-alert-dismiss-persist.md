# HLW-025: Persist alert dismissals across loads

- **Status:** done (deployed 2026-08-23)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/43
- **Branch:** `feat/HLW-024-025-share-alerts`
- **Created:** 2026-08-23

## Summary

Closing an NWS alert used to only hide it for the session (`alertGone={}` in memory), so a
page reload brought it back. Now dismissals persist.

## Details

- Store dismissed alert IDs in **localStorage** (`havasu_alert_dismiss`) as `{id: expiryMs}`
  using the alert's NWS `expires`.
- `renderAlerts` filters out dismissed (non-expired) ids; on each load we **prune** expired
  entries so the map never grows.
- A re-issued/updated alert (new id) still shows; expired alerts drop off on their own.
  Since heat alerts are routine here, dismissing one now actually sticks.

## Verified

Dismissed "Flash Flood Warning" → reloaded → it stayed gone (only the un-dismissed Heat
Advisory showed); localStorage held the id + expiry (Playwright). Deployed, SW v26.
