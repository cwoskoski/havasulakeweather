/**
 * HLW-017 — one-off backfill of historical lake & dam data into DynamoDB.
 *
 * Pulls the full daily record RISE publishes (storage acre-ft + Davis/Parker releases,
 * plus water temps where available) and writes one WATER#DAILY snapshot per historical
 * day, matching the shape the scheduled ingest (HLW-015) writes going forward.
 *
 * Historical ELEVATION is intentionally omitted: live elevation is USGS-derived
 * (gage height + 402.85 datum ≈ 452 ft); RISE's elevation series uses a different datum
 * (~448 ft full pool), so mixing them would put a ~4 ft step at the join. Storage
 * (acre-ft) is datum-independent, so that's what we backfill for level history.
 *
 * Usage (run locally with the havasu SSO profile):
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-water.mjs            # dry-run
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-water.mjs --write     # write to DynamoDB
 *   ... --from=1990   # optional: start year override (default = each series' record start)
 *
 * Dry-run fetches everything and reports counts / date ranges / samples but writes nothing.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const WRITE = process.argv.includes("--write");
const FROM_ARG = (process.argv.find((a) => a.startsWith("--from=")) || "").split("=")[1];
const TABLE = process.env.TABLE_NAME || "havasu-weather";
const PK = "WATER#DAILY";
const UA = "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";

// RISE catalog items → snapshot field. `round` controls int vs. 1-decimal.
const SERIES = [
  { itemId: "6129", field: "havasuStorageAf", label: "Havasu storage (af)", start: "1938-10-01", round: 0 },
  { itemId: "6134", field: "mohaveStorageAf", label: "Mohave storage (af)", start: "1950-02-02", round: 0 },
  { itemId: "6135", field: "davisCfs", label: "Davis release (cfs)", start: "1949-03-01", round: 0 },
  { itemId: "6130", field: "parkerCfs", label: "Parker release (cfs)", start: "1935-01-02", round: 0 },
  { itemId: "6127", field: "havasuTempF", label: "Havasu temp (F)", start: "2006-11-23", round: 1 },
  { itemId: "6132", field: "mohaveTempF", label: "Mohave temp (F)", start: "2007-01-01", round: 1 },
];

// Backfill stops at yesterday so we never clobber today's live-ingest row (which carries elevation).
const TODAY = new Date().toISOString().slice(0, 10);
const yday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch one RISE item across [after, before], following JSON:API pagination.
async function fetchWindow(itemId, after, before) {
  let url = `https://data.usbr.gov/rise/api/result?itemId=${itemId}&itemsPerPage=10000&dateTime%5Bafter%5D=${after}&dateTime%5Bbefore%5D=${before}`;
  const out = [];
  for (let guard = 0; url && guard < 50; guard++) {
    let r, tries = 0;
    while (true) {
      try {
        r = await fetch(url, { headers: { accept: "application/vnd.api+json" } });
        if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
        break;
      } catch (e) {
        if (++tries >= 4) throw e;
        await sleep(500 * tries);
      }
    }
    if (!r.ok) throw new Error(`RISE ${itemId} ${after}..${before} -> ${r.status}`);
    const j = await r.json();
    for (const x of j.data || []) {
      const date = (x.attributes.dateTime || "").slice(0, 10);
      const value = parseFloat(x.attributes.result);
      if (date && Number.isFinite(value)) out.push({ date, value });
    }
    const next = j.links && j.links.next;
    url = next && next !== url ? next : null;
  }
  return out;
}

// Fetch a full series in 5-year windows (fast, avoids the full-series order=desc hang).
async function fetchSeries(s) {
  const startYear = Math.max(+(FROM_ARG || 0), +s.start.slice(0, 4)) || +s.start.slice(0, 4);
  const endYear = +yday.slice(0, 4);
  const points = new Map(); // date -> value (last wins)
  for (let y = startYear; y <= endYear; y += 5) {
    const after = `${y - 1}-12-31`;               // exclusive-after → includes Jan 1 of y
    const before = `${Math.min(y + 5, endYear + 1)}-01-01`; // exclusive-before
    const pts = await fetchWindow(s.itemId, after, before);
    for (const p of pts) if (p.date <= yday) points.set(p.date, p.value);
    process.stdout.write(`\r  ${s.label}: ${points.size} pts (through ${y + 4})   `);
  }
  process.stdout.write("\n");
  return points;
}

function fmtRange(map) {
  if (!map.size) return "(none)";
  const ks = [...map.keys()].sort();
  return `${map.size} days  ${ks[0]} → ${ks[ks.length - 1]}`;
}

async function main() {
  console.log(`HLW-017 backfill — mode: ${WRITE ? "WRITE" : "DRY-RUN"} | table: ${TABLE} | cutoff: ${yday}\n`);
  console.log("Fetching RISE series (5-yr windows)…");
  const maps = {};
  for (const s of SERIES) maps[s.field] = await fetchSeries(s);

  // Merge by date into daily snapshots.
  const days = new Map(); // date -> item
  for (const s of SERIES) {
    for (const [date, value] of maps[s.field]) {
      let row = days.get(date);
      if (!row) { row = { pk: PK, sk: date, date, backfilled: true }; days.set(date, row); }
      row[s.field] = s.round === 0 ? Math.round(value) : +value.toFixed(1);
    }
  }
  const rows = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  console.log("\n=== Per-series coverage ===");
  for (const s of SERIES) console.log(`  ${s.label.padEnd(22)} ${fmtRange(maps[s.field])}`);

  console.log("\n=== Merged snapshots ===");
  console.log(`  total days: ${rows.length}`);
  if (rows.length) console.log(`  date range: ${rows[0].date} → ${rows[rows.length - 1].date}`);
  const bytes = rows.reduce((n, r) => n + JSON.stringify(r).length, 0);
  console.log(`  est. size:  ${(bytes / 1e6).toFixed(2)} MB | est. on-demand write cost: ~$${(rows.length / 1e6 * 1.25).toFixed(3)}`);

  console.log("\n=== Sample rows ===");
  const samples = [rows[0], rows[Math.floor(rows.length / 2)], ...rows.slice(-2)].filter(Boolean);
  for (const r of samples) console.log("  " + JSON.stringify(r));

  if (!WRITE) {
    console.log(`\nDry-run only — nothing written. Re-run with --write to load ${rows.length} rows.`);
    return;
  }

  console.log(`\nWriting ${rows.length} rows to ${TABLE}…`);
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  let written = 0;
  for (let i = 0; i < rows.length; i += 25) {
    let batch = rows.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; batch.length && attempt < 6; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }));
      const un = (res.UnprocessedItems && res.UnprocessedItems[TABLE]) || [];
      written += batch.length - un.length;
      batch = un;
      if (batch.length) await sleep(200 * (attempt + 1));
    }
    if (batch.length) throw new Error(`Gave up with ${batch.length} unprocessed items near ${rows[i].date}`);
    if (i % 2500 === 0) process.stdout.write(`\r  written ${written}/${rows.length}   `);
  }
  process.stdout.write(`\r  written ${written}/${rows.length}   \n`);
  console.log("Done.");
}

main().catch((e) => { console.error("\nBACKFILL FAILED:", e.message); process.exit(1); });
