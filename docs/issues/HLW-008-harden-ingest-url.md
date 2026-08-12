# HLW-008: Harden ingest Function URL + reduce station-key exposure

- **Status:** proposed
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/9
- **Branch:** `feat/HLW-008-harden-ingest-url`
- **PR:** (open when the work is ready)
- **Created:** 2026-08-12

## Summary

The ingest Function URL is public and accepts anonymous POSTs; the station PASSKEY is also exposed in /api/current. Lock the URL to CloudFront-only (OAC), add reserved concurrency, and stop returning the raw station key.

## Plan

See issue #9 for detail. Per CLAUDE.md, the implementation plan is presented for approval before any code.

## Acceptance criteria

- [ ] finalized when picked up
