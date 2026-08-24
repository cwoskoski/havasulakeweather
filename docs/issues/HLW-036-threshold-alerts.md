# HLW-036: Threshold alerts — wind (and later lake level) push notifications

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/65
- **Branch:** `feat/HLW-036-threshold-alerts`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 8 of 13 (feature-research backlog)

## Summary

Let visitors opt into **push alerts from our own station**: "notify me when sustained
wind tops 15 mph" (boaters' #1 ask), later lake-level / release-change thresholds.
The PWA is already installed on users' phones — this is the feature that makes it
indispensable rather than a bookmark.

## Motivation / context

- Research (2026-08-23): configurable threshold alerts are the stickiest feature across
  three separate genres — wind apps (WindAlert/FishWeather), river apps (RiverApp's core
  feature), and station networks (Ambient **paywalls** SMS alerts behind AWN+). Nobody
  offers them for this lake from an on-lake station. Free push = clear differentiation.
- Recurring-visit driver: an alert subscription converts a occasional visitor into a
  daily relationship with the site.

## Plan

- [ ] **Phase 0 (zero-infra, ship immediately):** "Get level alerts" link on `/water`
      deep-linking USGS WaterAlert (free email/SMS on the Havasu gauge) with a one-line
      how-to. Zero build cost, real value.
- [ ] **Phase 1 (wind push, our infra):** Web Push — VAPID keypair (new NoEcho SAM
      params), subscription endpoint on the read/ingest Lambda storing subscriptions +
      chosen threshold in DynamoDB, and a check on station ingest (already fires every
      minute) that sends pushes on upward threshold crossings with a cooldown
      (e.g. ≥ 2 h between alerts per subscriber).
- [ ] UI: alert bell on the home page — pick threshold (10/15/20/25 mph), permission
      flow, manage/unsubscribe. iOS requires the PWA installed to Home Screen for push —
      detect and explain. SW push handler + cache bump.
- [ ] Unit tests: crossing detection, cooldown, hysteresis (no flapping at the threshold).
- [ ] Cost/abuse review before deploy: subscription table TTL for dead endpoints,
      per-send error pruning (410 Gone → delete).

## Acceptance criteria

- [ ] Phase 0 link live on `/water`.
- [ ] A subscribed device receives a push within one ingest cycle of a threshold crossing.
- [ ] No repeat alert within the cooldown; dropping below and re-crossing after cooldown
      re-alerts.
- [ ] Unsubscribe works and dead subscriptions are pruned automatically.
- [ ] Secrets (VAPID private key) handled as NoEcho params; costs estimated and accepted.

## Notes

- Effort: **high** (the only ticket touching ingest, storage, SW, and UI at once) —
  which is why it ranks below cheaper wins despite top-tier stickiness.
- Later phases: lake-level and scheduled-release-change alerts reuse the same pipeline
  (HLW-038 would feed the latter).
