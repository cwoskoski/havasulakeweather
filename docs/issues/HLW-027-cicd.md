# HLW-027: CI/CD with GitHub Actions — PR checks + deploy on merge to main

- **Status:** in-progress (built on branch; awaiting review + one-time OIDC bootstrap)
- **GitHub issue:** https://github.com/cwoskoski/havasulakeweather/issues/51
- **Branch:** `feat/HLW-027-cicd`
- **Created:** 2026-08-23

## Summary

There were **no tests and no CI** before this. This adds:

1. A dependency-free unit-test suite (Node's built-in `node --test`, 53 tests) over the
   pure logic: NWS forecast day-pairing + glyphs + "rain soon", alert normalization,
   the Colorado cascade (net-flow rising/draining/steady, % full, vs-history), and the
   rain-state debounce. No new dependencies.
2. **PR checks** (`.github/workflows/ci.yml`) — runs on every PR into `main`, needs **no
   AWS creds**: unit tests, `node --check` syntax on all JS, a secret scan (no 30+ hex
   runs in added lines), a service-worker cache-bump check (fails if `web/` changed but
   `havasu-wx-vN` wasn't bumped), and `sam validate --lint`.
3. **Deploy on merge to main** (`.github/workflows/deploy.yml`) — path-filtered:
   - site job → `aws s3 sync web/` + CloudFront invalidation (us-east-1), only if `web/` changed.
   - ingest job → `sam build && sam deploy` (us-west-2), only if `ingest/src`/`template.yaml`/`samconfig.toml` changed.
   - Preserves the NoEcho station + WU keys by reading them from the live read Lambda's
     env in-job, so they never live in GitHub and a redeploy can't wipe them.
4. **OIDC auth** (`infra/github-oidc.yaml`) — a GitHub OIDC provider + a `havasu-github-deploy`
   role scoped to `repo:cwoskoski/havasulakeweather:ref:refs/heads/main`. No long-lived
   AWS keys in GitHub. Role ARN is hardcoded in the workflow (ARNs aren't secret).

## Operating-model change

This shifts the deploy gate: **merging a PR to `main` now deploys automatically.** The
gate becomes the merge (Chad's call) rather than a separate manual deploy command. The
manual `sam deploy` / `s3 sync` commands in CLAUDE.md remain as the fallback / bootstrap
path. CLAUDE.md updated to reflect this.

## Rollout (all gated on Chad)

1. Review + merge this PR's **files** — but note: merging triggers the pipeline. Before
   the OIDC role exists, the deploy jobs will fail at the auth step (harmless). So:
2. **First**, bootstrap OIDC once: `aws cloudformation deploy ... infra/github-oidc.yaml`
   (see `infra/README.md`). This is an AWS change → **gated**.
3. **Then** merge to `main`. This PR touches `ingest/src/water.js` (added `export` on
   `netFlow`/`pctFull`/`contextFor` for testing — behavior-neutral), so the ingest job
   will deploy the read Lambda; no `web/` change, so the site job is skipped.

## Files

- `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- `infra/github-oidc.yaml`, `infra/README.md`
- `ingest/test/{forecast,water,rain}.test.mjs`; root `package.json` → `"test": "node --test"`
- `ingest/src/water.js` — `export` added to `netFlow`/`pctFull`/`contextFor`
- `samconfig.toml` — added `[ci.deploy.parameters]` (no `profile`, for OIDC creds)
- `CLAUDE.md` — CI/CD section + deploy-model note

## Acceptance

- [x] `npm test` → 53/53 pass locally.
- [ ] CI workflow green on this PR.
- [ ] OIDC stack deployed once (gated).
- [ ] First merge deploys the ingest stack cleanly; site skipped.
