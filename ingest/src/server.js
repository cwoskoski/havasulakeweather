/**
 * Havasu Lake Weather — ingest service (step 1: request logger)
 *
 * Zero dependencies. Listens for the HTTP request the Ambient Weather console
 * sends and logs exactly what arrives — method, path, and every query-string
 * field (and any POST body) — then replies "success" so the console is happy.
 *
 * Point the console's "Customized" upload at  http://<pi-ip>:8080/  and watch
 * the log. Seeing the real payload is how we decide the storage schema and
 * settle the Ambient-vs-Wunderground format question with actual data instead
 * of guesswork. Storage (SQLite) comes next, once we know the fields.
 */

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const now = new Date().toISOString();
    const url = new URL(req.url, `http://${req.headers.host ?? "pi"}`);
    const params = Object.fromEntries(url.searchParams);
    const body = Buffer.concat(chunks).toString().trim();
    const source = req.socket.remoteAddress;

    console.log(`\n[${now}] ${req.method} ${url.pathname}  from ${source}`);
    const keys = Object.keys(params);
    if (keys.length > 0) {
      console.log("  query fields:");
      for (const [k, v] of Object.entries(params)) console.log(`    ${k} = ${v}`);
    } else {
      console.log("  (no query fields)");
    }
    if (body) console.log(`  body: ${body}`);

    // Both protocols accept a 200; Wunderground's endpoint expects "success".
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("success\n");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`havasu-weather ingest (logger) listening on http://${HOST}:${PORT}`);
  console.log("Point the weather console's custom upload here and watch for posts.");
});
