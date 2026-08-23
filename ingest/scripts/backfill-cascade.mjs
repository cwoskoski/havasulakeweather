/**
 * HLW-023 Phase 3 — backfill historical upstream-cascade data into WATER#DAILY.
 *
 * Adds Lake Mead (Hoover), Lake Powell (Glen Canyon) and the Grand Canyon reach (USGS
 * Lees Ferry) history to the daily snapshots that HLW-017 already backfilled for
 * Havasu/Mohave/Davis/Parker. Existing fields are preserved — each date's row is merged
 * (read all rows, add the new fields, re-PUT), so nothing is clobbered.
 *
 * Sources (free, no key):
 *   RISE  6123 mead elev · 6124 mead storage · 6125 hoover release
 *         508  powell elev · 509 powell storage · 511 powell inflow
 *   USGS  09380000 Lees Ferry — dv 00060 (canyon flow) + 00010 (canyon water temp °C→°F)
 *
 * Usage (local, havasu SSO profile):
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-cascade.mjs           # dry-run
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-cascade.mjs --write    # write
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const WRITE = process.argv.includes("--write");
const TABLE = process.env.TABLE_NAME || "havasu-weather";
const PK = "WATER#DAILY";
const UA = "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }),
  { marshallOptions: { removeUndefinedValues: true } });

const yday = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (v) => Math.round(v);
const dp2 = (v) => +v.toFixed(2);

// RISE catalog items → snapshot field + rounding.
const RISE = [
  { itemId: "6124", field: "meadStorageAf", start: "1935-01-01", fn: round },
  { itemId: "6123", field: "meadElevFt", start: "1935-01-01", fn: dp2 },
  { itemId: "6125", field: "hooverCfs", start: "1935-01-01", fn: round },
  { itemId: "509", field: "powellStorageAf", start: "1963-01-01", fn: round },
  { itemId: "508", field: "powellElevFt", start: "1963-01-01", fn: dp2 },
  { itemId: "511", field: "powellInflowCfs", start: "1963-01-01", fn: round },
];

async function riseWindow(itemId, after, before) {
  let url = `https://data.usbr.gov/rise/api/result?itemId=${itemId}&itemsPerPage=10000&dateTime%5Bafter%5D=${after}&dateTime%5Bbefore%5D=${before}`;
  const out = [];
  for (let g = 0; url && g < 50; g++) {
    let r, tries = 0;
    while (true) {
      try { r = await fetch(url, { headers: { accept: "application/vnd.api+json" } }); if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`); break; }
      catch (e) { if (++tries >= 4) throw e; await sleep(500 * tries); }
    }
    if (!r.ok) throw new Error(`RISE ${itemId} ${after}..${before} -> ${r.status}`);
    const j = await r.json();
    for (const x of j.data || []) {
      const date = (x.attributes.dateTime || "").slice(0, 10);
      const v = parseFloat(x.attributes.result);
      if (date && date <= yday && Number.isFinite(v)) out.push([date, v]);
    }
    const next = j.links && j.links.next;
    url = next && next !== url ? next : null;
  }
  return out;
}

async function fetchRise(s, days) {
  const startYear = +s.start.slice(0, 4), endYear = +yday.slice(0, 4);
  for (let y = startYear; y <= endYear; y += 5) {
    const pts = await riseWindow(s.itemId, `${y - 1}-12-31`, `${Math.min(y + 5, endYear + 1)}-01-01`);
    for (const [date, v] of pts) days.set(date, { ...(days.get(date) || {}), [s.field]: s.fn(v) });
    process.stdout.write(`\r  ${s.field}: through ${y + 4}   `);
  }
  process.stdout.write("\n");
}

async function fetchUsgsDv(site, pcode, field, fn, days) {
  const url = `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${site}&parameterCd=${pcode}&startDT=1920-01-01&endDT=${yday}&statCd=00003`;
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) { console.log(`  USGS ${site}/${pcode}: HTTP ${r.status}`); return; }
  const ts = (await r.json()).value?.timeSeries || [];
  if (!ts.length) { console.log(`  USGS ${site}/${pcode}: no series`); return; }
  let n = 0;
  for (const v of ts[0].values[0].value || []) {
    const date = (v.dateTime || "").slice(0, 10), x = parseFloat(v.value);
    if (date && date <= yday && Number.isFinite(x) && x > -999) { days.set(date, { ...(days.get(date) || {}), [field]: fn(x) }); n++; }
  }
  console.log(`  ${field}: ${n} days`);
}

async function loadExisting() {
  const rows = new Map(); let key;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": PK }, ExclusiveStartKey: key,
    }));
    for (const it of r.Items || []) rows.set(it.sk, it);
    key = r.LastEvaluatedKey;
  } while (key);
  return rows;
}

function fmtRange(keys) { const k = [...keys].sort(); return k.length ? `${k.length} days  ${k[0]} → ${k[k.length - 1]}` : "(none)"; }

async function main() {
  console.log(`HLW-023 cascade backfill — mode: ${WRITE ? "WRITE" : "DRY-RUN"} | cutoff ${yday}\n`);
  console.log("Fetching new upstream history…");
  const add = new Map(); // date -> {field: value}
  for (const s of RISE) await fetchRise(s, add);
  await fetchUsgsDv("09380000", "00060", "canyonCfs", round, add);
  await fetchUsgsDv("09380000", "00010", "canyonTempF", (c) => +(c * 9 / 5 + 32).toFixed(1), add);

  console.log("\nLoading existing WATER#DAILY rows…");
  const existing = await loadExisting();
  console.log(`  ${existing.size} existing rows.`);

  // Merge: add new fields onto existing rows; create rows for dates that have new data but no row.
  let updated = 0, created = 0;
  const puts = [];
  const perField = {};
  for (const [date, fields] of add) {
    for (const f of Object.keys(fields)) (perField[f] = perField[f] || new Set()).add(date);
    const row = existing.get(date);
    if (row) { updated++; puts.push({ ...row, ...fields }); }
    else { created++; puts.push({ pk: PK, sk: date, date, backfilled: true, ...fields }); }
  }

  console.log("\n=== Per-field coverage ===");
  for (const s of RISE) console.log(`  ${s.field.padEnd(16)} ${fmtRange(perField[s.field] || [])}`);
  console.log(`  ${"canyonCfs".padEnd(16)} ${fmtRange(perField.canyonCfs || [])}`);
  console.log(`  ${"canyonTempF".padEnd(16)} ${fmtRange(perField.canyonTempF || [])}`);
  console.log(`\n  rows to update (existing dates): ${updated}`);
  console.log(`  rows to create (new dates):      ${created}`);
  console.log(`  total writes: ${puts.length}  | est. ~$${(puts.length / 1e6 * 1.25).toFixed(3)}`);

  const sample = [puts[0], puts[Math.floor(puts.length / 2)], puts[puts.length - 1]].filter(Boolean);
  console.log("\n=== Sample merged rows ===");
  for (const r of sample) console.log("  " + JSON.stringify({ sk: r.sk, meadStorageAf: r.meadStorageAf, powellStorageAf: r.powellStorageAf, hooverCfs: r.hooverCfs, canyonCfs: r.canyonCfs, canyonTempF: r.canyonTempF, havasuStorageAf: r.havasuStorageAf }));

  if (!WRITE) { console.log(`\nDry-run only — nothing written. Re-run with --write to merge ${puts.length} rows.`); return; }

  console.log(`\nWriting ${puts.length} merged rows…`);
  let w = 0;
  for (let i = 0; i < puts.length; i += 25) {
    let batch = puts.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } }));
    for (let a = 0; batch.length && a < 6; a++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }));
      const un = (res.UnprocessedItems && res.UnprocessedItems[TABLE]) || [];
      w += batch.length - un.length; batch = un;
      if (batch.length) await sleep(200 * (a + 1));
    }
    if (batch.length) throw new Error(`Gave up with ${batch.length} unprocessed near ${puts[i].sk}`);
    if (i % 2500 === 0) process.stdout.write(`\r  written ${w}/${puts.length}   `);
  }
  process.stdout.write(`\r  written ${w}/${puts.length}   \n`);
  console.log("Done.");
}

main().catch((e) => { console.error("\nBACKFILL FAILED:", e.message); process.exit(1); });
