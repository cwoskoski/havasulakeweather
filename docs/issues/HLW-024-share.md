# HLW-024: Share button (Web Share API + fallback) with analytics

- **Status:** done (deployed 2026-08-23)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/42
- **Branch:** `feat/HLW-024-025-share-alerts`
- **Created:** 2026-08-23

## Summary

A "Share with a neighbor" button in the support card. Uses the **Web Share API**
(`navigator.share`) for the native OS share sheet where available (~92% — all mobile +
desktop Chrome/Edge/Safari), with a self-contained fallback menu (Copy link · Facebook ·
Text · Email) for desktop Firefox / Linux. No backend, no external scripts. OG tags already
solid, so Facebook/iMessage previews render well.

## Details

- `navigator.canShare/share({title,text,url})` first; catches `AbortError` silently; real
  errors fall through to the fallback menu.
- Fallback links: `facebook.com/sharer?u=`, `sms:?&body=` (cross-platform-safe), `mailto:`;
  Copy uses `navigator.clipboard` with inline "✓ Copied!" feedback.
- **Analytics (GA4):** `share {method: native|copy|facebook|sms|email}` + `share_menu_open`;
  plus `view_water {source: teaser}` on the home Lake & River teaser, and **gtag added to
  `water.html`** so /water gets page_views (was untracked).

## Verified

Fallback menu + links correct (Playwright, Linux → no native share); GA events fired
(`share_menu_open`, `share {copy}`). Deployed, SW v26.
