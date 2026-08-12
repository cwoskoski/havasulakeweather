# deploy

Operational config for running the stack on the Pi.

- `systemd/` — unit files to keep the ingest service (and Litestream) running
  across reboots.
- Litestream config (SQLite → Cloudflare R2 backup) — added when we wire storage.
- Cloudflare Tunnel config — added in phase 2 for the public page.

Populated as each piece lands.
