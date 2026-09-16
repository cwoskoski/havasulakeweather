# HLW-049: Client-side cache (stale-while-revalidate) to kill the `--` flash

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/95
- **Branch:** `feat/HLW-049-client-side-cache`
- **PR:** <url>
- **Created:** 2026-09-16

## Summary

Each page is a full document load (static multi-page PWA), so every visit — and every
page-to-page navigation — starts with `--` placeholders, fires `/api/*` fetches, and only
paints real numbers once the network resolves. Add an **app-layer stale-while-revalidate
cache in `localStorage`**: on boot, synchronously paint the last-known values (no `--`),
then the existing live fetches run and overwrite with fresh data.

## Motivation / context

The `--` flash on every load/navigation reads as "broken/loading" for a community site
people glance at repeatedly. The service worker deliberately bypasses `/api/*`
(`web/sw.js`) so there is no data layer catching this today. `localStorage` is the right
store: synchronous (paints before first frame), persists across navigation + restart,
same-origin, ~KB payloads.

## Plan

- [ ] **Cache helper** (`hlw:v1:` namespace, `{savedAt,data}`, 24 h max-age guard) +
      a `MOCKING` gate so demo/mock previews never read or write the cache. Added to both
      `index.html` and `water.html`.
- [ ] **`web/index.html`:** extract `renderCurrent` / `renderHistory` / `renderAir` so
      boot-hydrate and fetch-success share one render path; `cachePut` on success for
      **current, history(24), forecast, compare, water, air**; hydrate all six from cache
      before the live loads fire. **Alerts intentionally uncached** (a canceled/expired NWS
      alert must never reappear, even for a frame; dismiss-state already lives in localStorage).
- [ ] **`web/water.html`:** `cachePut("water")` on success (shared key warms both pages);
      hydrate `render(cache)` before the live load.
- [ ] Honesty: `renderCurrent` derives `lastReceived` from `d.receivedAt`, so a hydrate shows
      the correct "Updated Nm ago" / "Station quiet" via the existing freshness indicator —
      old cache is never presented as live; > 24 h old is skipped entirely.
- [ ] Bump SW `CACHE` v41→v42, `RELEASE` r5→r6 (user-facing → update toast).

## Acceptance criteria

- [ ] On a warm cache, a reload / page-to-page navigation shows last-known values immediately
      (no `--` flash); live fetch then updates in place (flash animation on changed values).
- [ ] Freshness indicator reflects the cached reading's real age; cache > 24 h old is ignored.
- [ ] `?demo=1` / `?mock*=` previews neither read nor write the cache (fixtures stay pure).
- [ ] Alerts are never served from cache.
- [ ] `node --check` clean on all JS; `npm test` green; SW cache + release bumped (`v42`/`r6`).

## Notes

- Endpoints cached: `current` (incl. lightning), `history24`, `forecast`, `compare`,
  `water`, `air`. Radar is out of scope (RainViewer animation frames, cross-origin, no `--`).
- Shared `water` key: `index.html` (teaser) and `water.html` (full page) read the same
  `/api/water` payload, so either page's fetch warms the other.
- Storage is bounded and try/caught for quota; `history24` is the largest payload (~1 pt/min).
