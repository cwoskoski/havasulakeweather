/**
 * Havasu Lake Weather — local dev server (HLW-012).
 *
 * Serves web/ and runs the REAL read handler (ingest/src/read.js) for /api/*,
 * against real DynamoDB (via the `havasu` SSO profile) and the real NWS/USGS/WU
 * APIs — so you can test the whole site locally without deploying.
 *
 *   npm install        # once, to get the AWS SDK locally
 *   npm run dev        # -> http://localhost:8788
 *
 * Secrets (station key, WU read key) are pulled from the deployed Lambda's
 * config at startup, so nothing sensitive lives on disk. Override any of them
 * (incl. AWS_PROFILE / PORT) via the environment or a gitignored .env.local
 * you source yourself.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(HERE, "..");
const WEB = join(ROOT, "web");

const PORT = Number(process.env.PORT || 8788);
const PROFILE = process.env.AWS_PROFILE || "havasu";
const REGION = process.env.AWS_REGION || "us-west-2";

// Config the read handler reads at import time — set BEFORE importing it.
process.env.AWS_PROFILE = PROFILE;
process.env.AWS_REGION = REGION;
process.env.TABLE_NAME = process.env.TABLE_NAME || "havasu-weather";

// Pull a NoEcho value straight from the deployed Lambda config.
async function lambdaEnv(name) {
  const { stdout } = await execFileP("aws", [
    "lambda", "get-function-configuration",
    "--function-name", "havasu-weather-read",
    "--region", REGION, "--profile", PROFILE,
    "--query", `Environment.Variables.${name}`, "--output", "text",
  ]);
  const v = stdout.trim();
  return v && v !== "None" ? v : "";
}

async function loadSecrets() {
  if (!process.env.STATION_KEY) process.env.STATION_KEY = await lambdaEnv("STATION_KEY");
  if (!process.env.WU_API_KEY) process.env.WU_API_KEY = await lambdaEnv("WU_API_KEY");
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml", ".txt": "text/plain",
};

function toEvent(req, url) {
  return {
    rawPath: url.pathname,
    requestContext: { http: { method: req.method, path: url.pathname } },
    queryStringParameters: Object.fromEntries(url.searchParams),
  };
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = join(WEB, safe);
  if (!file.startsWith(WEB)) { res.writeHead(403).end("forbidden"); return; }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  } catch {
    try {
      const buf = await readFile(join(WEB, "index.html"));
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end(buf);
    } catch { res.writeHead(404).end("not found"); }
  }
}

async function main() {
  await loadSecrets();
  console.log(`[dev] TABLE_NAME=${process.env.TABLE_NAME}  profile=${PROFILE}  region=${REGION}`);
  console.log(`[dev] STATION_KEY ${process.env.STATION_KEY ? "loaded" : "MISSING"} | WU_API_KEY ${process.env.WU_API_KEY ? "loaded" : "not set"}`);

  // Import AFTER env is set (read.js and its modules read process.env at load).
  const { handler } = await import("../ingest/src/read.js");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      try {
        const out = await handler(toEvent(req, url));
        const headers = { ...(out.headers || {}), "access-control-allow-origin": "*" };
        res.writeHead(out.statusCode || 200, headers);
        res.end(out.body || "");
      } catch (e) {
        console.error("[dev] handler error:", e);
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "dev-handler", detail: String(e?.message || e) }));
      }
      return;
    }
    await serveStatic(res, url.pathname);
  });

  server.listen(PORT, () => {
    console.log(`\n  ▸ Havasu dev server → http://localhost:${PORT}`);
    console.log(`     full site + live /api/* (real DynamoDB + NWS/USGS/WU). Try:`);
    console.log(`       http://localhost:${PORT}/`);
    console.log(`       http://localhost:${PORT}/?demo=1`);
    console.log(`       http://localhost:${PORT}/api/current`);
    console.log(`       http://localhost:${PORT}/api/water?mock=high-release\n`);
  });
}

main().catch((e) => { console.error("[dev] failed to start:", e); process.exit(1); });
