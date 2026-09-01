/**
 * Havasu Lake Weather — lake & river ingest (scheduled).
 *
 * Pulls the current lake levels, storage (acre-ft), water temps, and Davis/Parker
 * releases (via getLive() in water.js) and writes ONE daily snapshot to DynamoDB
 * (pk = WATER#DAILY, sk = <YYYY-MM-DD>). /api/water then reads from these snapshots
 * instead of hitting USGS/RISE on the hot path — fast, reliable, and it accumulates
 * our own history. Idempotent per day (each run upserts today's snapshot).
 *
 * Resilience (HLW-046): a source (esp. slow USGS) can hiccup and return null for one
 * run. Rather than overwrite a good snapshot with null — which blanked the lake for up
 * to 6h — we carry forward the previous snapshot's value for any field that comes back
 * null. Worst case a field is a few hours stale; it never goes blank from a transient blip.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getLive } from "./water.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.TABLE_NAME;

// Data fields carried forward from the last snapshot when a source returns null.
const CARRY = [
  "havasuElevFt", "havasuStorageAf", "havasuTempF",
  "mohaveElevFt", "mohaveStorageAf", "mohaveTempF",
  "davisCfs", "parkerCfs",
  "powellElevFt", "powellStorageAf", "powellInflowCfs",
  "canyonCfs", "canyonTempF", "meadElevFt", "meadStorageAf", "hooverCfs",
];

// Pure: prefer the fresh value; when it's null, fall back to the previous snapshot's value
// (never overwrite good → null). Returns the merged fields + which keys were carried forward.
export function carryForward(fresh, prev) {
  const merged = { ...fresh };
  const carried = [];
  if (prev) {
    for (const k of CARRY) {
      if (merged[k] == null && prev[k] != null) { merged[k] = prev[k]; carried.push(k); }
    }
  }
  return { merged, carried };
}

// Newest stored WATER#DAILY snapshot (for carry-forward); null if none / on error.
async function latestSnapshot() {
  try {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "WATER#DAILY" },
      ScanIndexForward: false,
      Limit: 1,
    }));
    return r.Items?.[0] || null;
  } catch {
    return null;
  }
}

export const handler = async () => {
  const w = await getLive();
  const lake = w.lake || {}, up = w.upstream || {};
  const c = Object.fromEntries((w.cascade || []).map((n) => [n.key, n])); // upstream cascade by key
  const date = new Date().toISOString().slice(0, 10); // UTC day; upsert keeps one/day

  const fresh = {
    havasuElevFt: lake.elevationFt ?? null,
    havasuStorageAf: lake.storageAf ?? null,
    havasuTempF: lake.waterTempF ?? null,
    mohaveElevFt: up.elevationFt ?? null,
    mohaveStorageAf: up.storageAf ?? null,
    mohaveTempF: up.waterTempF ?? null,
    davisCfs: w.inflow ? w.inflow.cfs : null,
    parkerCfs: w.outflow ? w.outflow.cfs : null,
    // HLW-023 — upstream cascade (Powell / Grand Canyon / Mead / Hoover)
    powellElevFt: c.powell ? c.powell.elevationFt : null,
    powellStorageAf: c.powell ? c.powell.storageAf : null,
    powellInflowCfs: w.powellInflowCfs ?? null,
    canyonCfs: c.grandcanyon ? c.grandcanyon.cfs : null,
    canyonTempF: c.grandcanyon ? c.grandcanyon.waterTempF : null,
    meadElevFt: c.mead ? c.mead.elevationFt : null,
    meadStorageAf: c.mead ? c.mead.storageAf : null,
    hooverCfs: c.hoover ? c.hoover.cfs : null,
  };

  // Carry forward any field that hiccupped to null, from the last snapshot.
  const { merged, carried } = carryForward(fresh, await latestSnapshot());
  const item = { pk: "WATER#DAILY", sk: date, date, updatedAt: new Date().toISOString(), ...merged };

  // Skip writing an all-null snapshot (every source hiccupped AND nothing to carry forward).
  const anyValue = [item.havasuElevFt, item.davisCfs, item.parkerCfs, item.havasuStorageAf].some((v) => v != null);
  if (!anyValue) {
    console.error(JSON.stringify({ msg: "water-ingest-empty", date }));
    return { stored: null, reason: "no-values" };
  }

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  console.log(JSON.stringify({
    msg: "water-stored", date, davisCfs: item.davisCfs, parkerCfs: item.parkerCfs,
    havasuStorageAf: item.havasuStorageAf, havasuElevFt: item.havasuElevFt,
    carried: carried.length ? carried : undefined,
  }));
  return { stored: date, carried };
};
