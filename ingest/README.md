# ingest

Node service that receives the weather console's HTTP posts and stores them.

## Status: step 1 — request logger (zero dependencies)

`src/server.js` currently just **logs** every request the console sends and replies
`success`. Point the console's custom upload at the Pi and watch the output to see
the real field names — that's how we finalize the storage schema and confirm the
Ambient-vs-Wunderground format choice with real data.

Storage (SQLite via `better-sqlite3`) and dedupe come next.

## Run

```bash
npm start            # listens on 0.0.0.0:8080
PORT=9000 npm start  # override the port
```

## On the Pi

Raspberry Pi OS Lite doesn't ship Node — install Node 20 LTS, then run as above.
A systemd unit to keep it alive across reboots will live in `../deploy/systemd/`.

## Console upload settings (Ambient "Customized")

- Protocol: **Ambient Weather**
- Server / IP: the Pi's reserved LAN IP
- Port: **8080**
- Path: `/`
