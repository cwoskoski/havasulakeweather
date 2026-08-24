# HLW-033: Lake webcam (blocked: hardware / partner decision)

- **Status:** proposed (blocked — needs a camera decision before any build)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/62
- **Branch:** `feat/HLW-033-webcam`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 5 of 13 (feature-research backlog) — highest-impact single feature if
  shipped, ranked here only because it's hardware-gated

## Summary

A live lake view (still refreshed every few minutes, later timelapse) on the home page.
Research is unanimous that a webcam is the biggest single "is it worth driving out?"
feature a lake site can have — and the one thing no data API can substitute for.

## Motivation / context

- Research (2026-08-23): webcams anchor every successful lake-community site
  (golakehavasu's cam is its most-visited page-element; Windy integrates 55K cams as a
  headline feature; AWN sells camera tiers). For a lake 40 min from anywhere, "what does
  it look like right now" is the killer question.
- Nothing on the CA side of the lake publishes a cam today — clear open niche.

## Decision needed (blocking)

Pick one before any implementation:

1. **Own hardware** — an outdoor PoE/WiFi cam at Chad's site pushing stills. Full control,
   ongoing power/mount/dust/heat considerations (Mojave summers).
2. **Partner cam** — marina / store / resident hosts a cam we operate, or re-embed an
   existing cam with written permission.
3. **Defer** — park the ticket until 1 or 2 is workable.

## Plan (sketch — refine after the decision)

- [ ] Camera captures a still every 2–5 min → upload to the site S3 bucket
      (`/cam/latest.jpg` + timestamped copies for timelapse).
- [ ] Serve via the existing CloudFront distribution; short TTL on `latest.jpg`.
- [ ] Home page card with timestamp + staleness indicator; graceful "cam offline" state.
- [ ] Later: nightly timelapse assembly (Lambda + ffmpeg layer), archive retention policy.
- [ ] Privacy check: field of view avoids identifiable private property/people.

## Acceptance criteria

- [ ] Live still on the home page, ≤ 5 min old, with visible capture time.
- [ ] Offline state degrades cleanly (no broken image).
- [ ] Monthly AWS cost delta estimated and accepted before deploy (storage + egress).

## Notes

- Effort: **medium** software, but blocked on hardware; revisit when a camera path exists.
- S3 + CloudFront already in place — the pipeline is genuinely small once a camera exists.
