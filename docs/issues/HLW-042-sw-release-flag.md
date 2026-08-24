# HLW-042: Flag releases so the update toast only shows for user-facing changes

- **Status:** in-progress (built + validated; in PR)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/74
- **Branch:** `feat/HLW-042-sw-release-flag`
- **Created:** 2026-08-24

## Problem

Every `web/` change requires bumping the service-worker `CACHE` version (CI-enforced, for
cache correctness). But `sw-register.js` shows the **"New version available"** toast on *any*
new waiting worker — so cache-only changes with nothing user-facing (SEO meta, the 404 page,
backend-ish tweaks) still nag every installed user to refresh. E.g. the HLW-028 SEO deploys
would each have prompted users despite no visible change.

## Fix — decouple "cache version" from "notify the user"

- **`web/sw.js`**: keep `CACHE` (bump every `web/` change). Add a separate **`RELEASE`** marker
  bumped **only for user-facing changes**, and a message handler so the page can read a worker's
  `RELEASE` (MessageChannel `GET_RELEASE` → `{ release }`).
- **`web/sw-register.js`**: when a worker is waiting, compare its `RELEASE` to the running
  worker's:
  - **different** → show the toast (as before; tap → activate → reload).
  - **same** (or unknown) → activate the new worker **silently** in the background; no toast,
    no forced reload. The `controllerchange` reload is now gated on a user tap
    (`userInitiatedReload`), so silent activations don't reload the page.
- **`CLAUDE.md`**: document the two-marker convention.

## Behavior

- Default is **silent** — don't touch `RELEASE` → no toast. Opt in to the prompt by bumping it.
- First install and the one-time upgrade *to* this release-aware worker are silent (the old
  worker can't report a `RELEASE`, so the comparison is "unknown" → silent).
- `CACHE` → **v34** (v33 is reserved by the open Phase 2 PR #73; may need a one-line merge
  resolve on `web/sw.js` depending on merge order — keep the highest version).

## Acceptance

- [x] `node --check` passes on both SW files.
- [ ] CI green on the PR.
- [ ] After deploy: a cache-only bump (RELEASE unchanged) does **not** show the toast; a
      RELEASE bump does. (Verify on the next couple of deploys.)
