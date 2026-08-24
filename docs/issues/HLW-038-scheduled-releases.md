# HLW-038: Scheduled dam releases — what Parker/Davis will do today & tomorrow

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/67
- **Branch:** `feat/HLW-038-scheduled-releases`
- **PR:** —
- **Created:** 2026-08-23
- **Impact rank:** 10 of 13 (feature-research backlog)

## Summary

Show **scheduled** hourly releases for Parker and Davis dams (today/tomorrow) on
`/water`, alongside the observed releases we already display. Anglers, paddlers, and
shoreline users care about what the river is *about to do*, and almost no third-party
site surfaces the schedule.

## Motivation / context

- Research (2026-08-23): USBR's Lower Colorado river-ops pages publish next-day hourly
  release schedules (usbr.gov/lc/riverops.html) — flagged as the notable dataset most
  aggregators skip. Our `/water` page already tells the observed-flow story (HLW-002,
  HLW-013/014); the schedule completes it ("release ramps to 8,000 cfs at 6 AM").

## Plan

- [ ] **Data recon first** (research task inside this ticket): find the machine-readable
      form — check whether RISE exposes schedule datasets, and what format the riverops
      "Real-Time Operations Outlook" / Parker automated report actually serve (JSON, CSV,
      HTML). Decide fetch strategy + failure posture. If it's scrape-only HTML, weigh
      fragility before committing (this ticket dies gracefully if there's no stable feed).
- [ ] Fetch in the existing water ingest path (or read-Lambda with caching), normalized to
      `{ dam, hours: [{t, cfs}] }` for today + tomorrow.
- [ ] `/api/water`: `scheduled` block; `/water` flow card gets a small "scheduled" strip
      (peak, ramp times) — not a full chart in v1. SW bump.
- [ ] `?mockWater=` schedule scenarios (steady / morning ramp / weekend low).
- [ ] Unit tests for the parser/normalizer.

## Acceptance criteria

- [ ] Recon documented here: source, format, stability assessment, go/no-go.
- [ ] (If go) `/water` shows today's + tomorrow's scheduled peak and ramp windows per dam.
- [ ] Source outage degrades to the current observed-only view — no broken card.
- [ ] Parser unit-tested against captured fixtures.

## Notes

- Effort: **medium**, dominated by the recon and parser-robustness work.
- Pairs with HLW-036 later ("alert me when tomorrow's schedule jumps").
- Attribution + "provisional, schedules change" disclaimer required.
