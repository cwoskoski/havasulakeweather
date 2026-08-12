# Havasu Lake Weather

Self-hosted ingest and (later) a public community weather page for a personal
Ambient Weather station in Havasu Lake, CA.

## What this is

An Ambient Weather station pushes readings over the LAN to a Raspberry Pi, which
stores them in SQLite and continuously backs them up to cloud object storage.
Later, a mobile-friendly public page will serve current conditions and history to
the Havasu Lake community, fronted by Cloudflare's edge so a residential uplink
can handle any amount of traffic.

Runs for roughly **$0–2/month** (plus ~$10–12/year for a domain).

## Layout

| Folder    | What lives here                                                       |
|-----------|-----------------------------------------------------------------------|
| `ingest/` | Node service: receives the station's HTTP posts, writes SQLite. **Now.** |
| `web/`    | Public page + JSON API (`/api/current`, `/api/history`). **Later.**   |
| `deploy/` | systemd units, Litestream backup config, Cloudflare Tunnel config.    |
| `docs/`   | Architecture and the decisions behind it.                             |

See [docs/architecture.md](docs/architecture.md) for the full design and rationale.

## Hardware

- Raspberry Pi 4 Model B — Raspberry Pi OS Lite (64-bit), Wi-Fi
- Hostname `havasu-weather`
- Booting from SD card for now (plan: migrate to USB SSD for write endurance)
