# HLW-001: Project conventions — CLAUDE.md, tickets, branches/PRs, gated deploys

- **Status:** in-progress
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/1
- **Branch:** `feat/HLW-001-project-conventions`
- **PR:** (opened from this branch)
- **Created:** 2026-08-12

## Summary

Establish how we work on this repo going forward, so feature work is deliberate,
reviewable, and safe to ship.

## Motivation / context

Early build moved fast and committed/deployed straight to `main`. Going forward we
want: a plan before code, a paper trail per change, PR review, and no surprise deploys.

## Plan

- [x] Add `CLAUDE.md` (working agreement + non-secret infra reference + API/mock map).
- [x] Add `docs/issues/TEMPLATE.md` for the HLW-### ticket format.
- [x] Add this ticket (HLW-001) and open GitHub issue #1.
- [x] Do the work on a `feat/` branch and open a PR (this one) instead of committing to `main`.

## Acceptance criteria

- [ ] `CLAUDE.md` merged to `main`.
- [ ] Convention in use: next feature starts with a plan → ticket + issue → branch → PR.
- [ ] No deploys happen without explicit approval.

## Notes

- Chad uses the `pm-ticket-creator` agent for work projects; intentionally **not** used
  here — this lightweight scheme replaces it.
- Deploy = `sam deploy`, `s3 sync` to the site bucket, CloudFront invalidations, schema
  or scheduled-job changes. Building / local mocks / prototypes / artifacts are not deploys.
