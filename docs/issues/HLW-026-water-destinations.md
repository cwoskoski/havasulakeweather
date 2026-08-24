# HLW-026: "Where Havasu's water goes" explainer on /water

- **Status:** in-progress (built + previewed; awaiting deploy approval)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/48
- **Branch:** `feat/HLW-026-water-destinations`
- **Created:** 2026-08-24

## Summary

Static explainer card on `/water`, below the cascade: at Lake Havasu the Colorado splits —
most continues downstream through Parker Dam (already shown), but two big aqueducts pump
water out right here. Answers "where does the lake's water go?"

- **→ Southern California** — MWD Colorado River Aqueduct (Whitsett Intake ~2 mi above Parker
  Dam → 242 mi to LA/San Diego area). **~0.9M acre-ft/yr**, ~19M people.
- **→ Central Arizona** — CAP / Mark Wilmer Pumping Plant → Phoenix & Tucson. **~0.95M ac-ft/yr**.

## Why static (not live)

Researched (see chat): the daily MWD/CAP diversions are in Reclamation's LC g4000 **HTML**
report, but the machine-readable `accumweb.json` MWD/CAP series are empty (0/365; only SNWA
populated). So a live daily number would require a fragile HTML scrape. Annual volumes are
authoritative and stable → static card is the right call. (A live-daily version stays a
possible follow-up if the JSON ever populates or we accept the scrape.)

## Details

- `web/water.html`: new `.card` after `#cascade` with a lead + two destination rows +
  a "19 million people" note. Pure markup/CSS — no data fetch, no backend. SW → v30.

## Acceptance

- [x] Card renders after the cascade, matches the dark theme, 0 console errors.
- [ ] Deploy (site-only) — **gated on Chad's go**.
