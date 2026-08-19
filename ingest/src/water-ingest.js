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
