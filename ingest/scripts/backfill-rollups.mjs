/**
 * HLW-052 — one-off backfill of the HOUR# / DAY# rollups from the raw OBS# readings.
 *
 * Walks every month of station history, rolls each complete hour up exactly the way the
 * scheduled rollup Lambda does (same research.js maths), then builds each Pacific-local
 * day from its hours. Idempotent: re-running overwrites with identical items.
 *
 * Usage (run locally with the havasu SSO profile):
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-rollups.mjs           # dry-run
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/backfill-rollups.mjs --write   # write
 *   ... --from=2026-08   # optional first month (default 2025-01; empty months are skipped)
 *
 * The station key is read from the deployed read Lambda's config (never printed), or
 * from STATION_KEY if set. Dry-run reads everything and reports counts + a sample day.
 */

import { execFileSync } from "node:child_process";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { rollupHours, hourPk, dayPk, localDay, monthsBetween, outAgg, DAY_TIMED, isoSec } from "../src/research.js";
import { dayFromHours } from "../src/rollup.js";

const WRITE = process.argv.includes("--write");
const FROM = (process.argv.find((a) => a.startsWith("--from=")) || "--from=2025-01").split("=")[1];
const TABLE = process.env.TABLE_NAME || "havasu-weather";
const REGION = process.env.AWS_REGION || "us-west-2";
const PROFILE = process.env.AWS_PROFILE || "havasu";
const HOUR = 3600e3;

const KEY = (process.env.STATION_KEY || execFileSync("aws", [
  "lambda", "get-function-configuration", "--function-name", "havasu-weather-read",
  "--region", REGION, "--profile", PROFILE, "--query", "Environment.Variables.STATION_KEY", "--output", "text",
]).toString().trim()).split(",")[0].trim();
if (!KEY || KEY === "None") { console.error("No station key."); process.exit(1); }

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), { marshallOptions: { removeUndefinedValues: true } });

async function month(mm) {
  const items = [];
  let ek;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: "pk = :pk", ExclusiveStartKey: ek,
      ExpressionAttributeValues: { ":pk": `OBS#${KEY}#${mm}` },
      ProjectionExpression: "sk, tempf, temp1f, humidity, windspeedmph, windgustmph, winddir, baromrelin, uv, solarradiation, dailyrainin",
    }));
    items.push(...(r.Items || []));
    ek = r.LastEvaluatedKey;
  } while (ek);
  return items.sort((a, b) => (a.sk < b.sk ? -1 : 1));
}

async function batchPut(items) {
  for (let i = 0; i < items.length; i += 25) {
    let req = { [TABLE]: items.slice(i, i + 25).map((Item) => ({ PutRequest: { Item } })) };
    for (let tries = 0; req && Object.keys(req).length && tries < 8; tries++) {
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: req }));
      req = r.UnprocessedItems && Object.keys(r.UnprocessedItems).length ? r.UnprocessedItems : null;
      if (req) await new Promise((ok) => setTimeout(ok, 200 * 2 ** tries));
    }
  }
}

const nowHour = Math.floor(Date.now() / HOUR) * HOUR; // complete hours only
const [fy, fm] = FROM.split("-").map(Number);
const hours = [];
let carry = null; // last reading of the previous month — seeds the rain diff across the month boundary
for (const mm of monthsBetween(Date.UTC(fy, fm - 1, 1), nowHour - 1)) {
  const readings = await month(mm);
  if (!readings.length) { carry = null; continue; }
  const [y, m] = mm.split("-").map(Number);
  const start = Date.UTC(y, m - 1, 1), end = Math.min(Date.UTC(y, m, 1), nowHour);
  const got = rollupHours(carry ? [carry, ...readings] : readings, start, end);
  hours.push(...got);
  carry = readings[readings.length - 1];
  console.log(`${mm}: ${readings.length} readings → ${got.length} hours (${readings[0].sk} … ${carry.sk})`);
}

const byDay = new Map();
for (const h of hours) {
  const d = localDay(Date.parse(h.sk));
  (byDay.get(d) || byDay.set(d, []).get(d)).push(h);
}
const days = [...byDay.entries()].map(([d, hs]) => dayFromHours(d, hs)).filter(Boolean);

console.log(`\nTotal: ${hours.length} hour items, ${days.length} day items (${days[0]?.sk} … ${days.at(-1)?.sk}).`);
const sample = days.at(-2) || days[0];
if (sample) {
  const o = outAgg(sample, DAY_TIMED);
  console.log(`Sample ${sample.sk}: shade ${o.shade?.min}–${o.shade?.max}°F (high ${o.shade?.maxAt}), sun high ${o.temp?.max}°F, gust ${o.gust?.max} mph, rain ${o.rainIn}", ${sample.hours} hours`);
}

if (!WRITE) { console.log("\nDry run — nothing written. Re-run with --write to store."); process.exit(0); }

const stamp = new Date().toISOString();
await batchPut(hours.map((h) => ({ pk: hourPk(KEY, Date.parse(h.sk)), ...h })));
await batchPut(days.map((d) => ({ pk: dayPk(KEY, d.sk), ...d, updatedAt: stamp })));
console.log(`Wrote ${hours.length} hour items + ${days.length} day items at ${isoSec(Date.now())}.`);
