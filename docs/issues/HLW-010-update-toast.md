# HLW-010: PWA "update available — refresh" toast

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/11
- **Branch:** `feat/HLW-010-update-toast`
- **PR:** (opened from this branch)
- **Created:** 2026-08-20

## Summary

When a new service-worker version is waiting, show a small persistent "New version
available — Refresh" toast so installed users pick up changes on tap instead of on some
later reload. We already bump the SW cache (`havasu-wx-vN`) each deploy; this surfaces it.

## Current state

- `sw.js` calls `self.skipWaiting()` on install → a new SW activates immediately and
  silently (nothing to prompt).
- `index.html` registers the SW with no update handling; `water.html` doesn't register at all.
- The existing `toast()` is a 2.2s auto-hiding, non-interactive pill (good for "Thanks",
  not for an actionable prompt).

## Plan

1. **`sw.js`** — drop `skipWaiting()` from `install` so a new SW parks in the *waiting*
   state (the hook for "update available"); add a `message` listener that calls
   `self.skipWaiting()` on `SKIP_WAITING`; keep `clients.claim()`.
2. **`web/sw-register.js`** (new, shared) — register `/sw.js`; detect an update via
   `registration.waiting` and `updatefound → installed` (+ `controller` present, so first
   installs don't prompt); show a self-contained, persistent, tappable toast; on tap
   `postMessage('SKIP_WAITING')`; reload once on `controllerchange` (guarded against loops).
   The toast builds its own DOM + inline styles so it works identically on both pages.
3. **`index.html` / `water.html`** — include `sw-register.js`; remove the old inline
   registration in `index.html` (now `water.html` gets registration too).
4. Add `sw-register.js` to the SW `SHELL`; bump cache to `havasu-wx-v18`.

## Tradeoff

After this, updates wait for a tap (or for all tabs to close) instead of applying
silently — which is the point of the toast, and better than the current invisible swap.

## Acceptance criteria

- [ ] Deploying a new SW version surfaces the toast for already-installed users.
- [ ] Tapping Refresh activates the waiting worker and reloads once (no reload loop).
- [ ] First-ever install does **not** show the toast.
- [ ] Works on both `/` and `/water`; 0 console errors.

## Out of scope

- Auto-refresh without a tap (intentionally prompt-driven).
