/**
 * Havasu Lake Weather — lake & river ingest (scheduled).
 *
 * Pulls the current lake levels, storage (acre-ft), water temps, and Davis/Parker
 * releases (via getLive() in water.js) and writes ONE daily snapshot to DynamoDB
 * (pk = WATER#DAILY, sk = <YYYY-MM-DD>). /api/water then reads from these snapshots
 * instead of hitting USGS/RISE on the hot path — fast, reliable, and it accumulates
 * our own history. Idempotent per day (each run upserts today's snapshot).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getLive } from "./water.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.TABLE_NAME;

export const handler = async () => {
  const w = await getLive();
  const lake = w.lake || {}, up = w.upstream || {};
  const c = Object.fromEntries((w.cascade || []).map((n) => [n.key, n])); // upstream cascade by key
  const date = new Date().toISOString().slice(0, 10); // UTC day; upsert keeps one/day

  const item = {
    pk: "WATER#DAILY",
    sk: date,
    date,
    updatedAt: new Date().toISOString(),
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

  // Skip writing an all-null snapshot (e.g. every upstream source hiccupped).
  const anyValue = [item.havasuElevFt, item.davisCfs, item.parkerCfs, item.havasuStorageAf].some((v) => v != null);
  if (!anyValue) {
    console.error(JSON.stringify({ msg: "water-ingest-empty", date }));
    return { stored: null, reason: "no-values" };
  }

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  console.log(JSON.stringify({ msg: "water-stored", date, davisCfs: item.davisCfs, parkerCfs: item.parkerCfs, havasuStorageAf: item.havasuStorageAf, havasuElevFt: item.havasuElevFt }));
  return { stored: date };
};
