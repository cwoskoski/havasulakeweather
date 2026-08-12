# Havasu Lake Weather

Serverless ingest and (later) a public community weather page for a personal
Ambient Weather station in Havasu Lake, CA.

## What this is

An Ambient Weather station posts readings over plaintext HTTP to CloudFront, which
bridges to a small Lambda that stores them in DynamoDB. Later, a mobile-friendly
public page will serve current conditions and history to the community, edge-cached
by CloudFront so a residential-scale audience costs nothing to serve.

Runs for roughly **$0–2/month**. No home server — it's fully serverless on AWS.

## Layout

| Path                            | What lives here                                                   |
|---------------------------------|-------------------------------------------------------------------|
| `ingest/`                       | Lambda source (Node 24): parses the console's HTTP posts → DynamoDB |
| `web/`                          | Public page + JSON API (Phase 3)                                   |
| `docs/architecture.md`          | The design and the decisions behind it                            |
| `docs/plan.md`                  | Phased build plan + decisions log                                 |
| `template.yaml` / `samconfig.toml` | SAM infrastructure (added in Phase 0), pinned to the `havasu` profile |

## AWS

- **Account:** personal `648581682379` · **Region:** `us-west-2`
- **Profile:** `havasu` (IAM Identity Center SSO) — `aws sso login --profile havasu`
- **IaC:** AWS SAM · **Runtime:** Node.js 24
- **Ingest endpoint (Phase 1 logger):** `http://dzn7sq96yz34g.cloudfront.net/` — the console's Customized upload points here (HTTP, port 80, Ambient format)

Start with [docs/plan.md](docs/plan.md).
