/**
 * Havasu Lake Weather — hourly + daily rollups for the /research page (HLW-052).
 *
 * Scheduled a few minutes past every hour. Re-rolls the last few complete hours from
 * the raw OBS# readings (idempotent overwrite, so a late or replayed reading is picked
 * up next run), then recomputes the Pacific-local DAY# item for each day those hours
 * touched from that day's hour items. Steady state: ~4 small writes an hour.
 *
 *   hourly:  pk = HOUR#<stationKey>#YYYY-MM,  sk = <hour start ISO>
 *   daily:   pk = DAY#<stationKey>#YYYY,      sk = <YYYY-MM-DD>
 *
 * Invoke with { hours: N } to re-roll a longer window by hand.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { rollupHours, mergeAgg, newAgg, compactAgg, hourPk, dayPk, monthsBetween, localDay, localDayStart, addDays, isoSec } from "./research.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.TABLE_NAME;
const STATION = (process.env.STATION_KEY || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
const HOUR = 3600e3;
const RAIN_SEED_MS = 30 * 60e3; // read a little before the window so the first hour's rain diff has a baseline

async function queryAll(params) {
  const items = [];
  let ek;
  do {
    const r = await ddb.send(new QueryCommand({ TableName: TABLE, ...params, ExclusiveStartKey: ek }));
    items.push(...(r.Items || []));
    ek = r.LastEvaluatedKey;
  } while (ek);
  return items;
}

export async function rawReadings(key, startMs, endMs) {
  const items = [];
  for (const mm of monthsBetween(startMs, endMs)) {
    items.push(...await queryAll({
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :s AND :e",
      ExpressionAttributeValues: { ":pk": `OBS#${key}#${mm}`, ":s": isoSec(startMs), ":e": isoSec(endMs) },
      ProjectionExpression: "sk, tempf, temp1f, humidity, windspeedmph, windgustmph, winddir, baromrelin, uv, solarradiation, dailyrainin",
    }));
  }
  return items.sort((a, b) => (a.sk < b.sk ? -1 : 1));
}

export async function hourItems(key, startMs, endMs) {
  const items = [];
  for (const mm of monthsBetween(startMs, endMs)) {
    items.push(...await queryAll({
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :s AND :e",
      ExpressionAttributeValues: { ":pk": `HOUR#${key}#${mm}`, ":s": isoSec(startMs), ":e": isoSec(endMs - 1) },
    }));
  }
  return items.sort((a, b) => (a.sk < b.sk ? -1 : 1));
}

// One local day from its hour items. Null when the station sent nothing that day.
export function dayFromHours(day, hours) {
  const a = newAgg();
  for (const h of hours) mergeAgg(a, h);
  return a.n ? { sk: day, hours: hours.length, ...compactAgg(a) } : null;
}

export async function rollDay(key, day) {
  const hours = await hourItems(key, localDayStart(day), localDayStart(addDays(day, 1)));
  const item = dayFromHours(day, hours);
  if (item) await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: dayPk(key, day), ...item, updatedAt: new Date().toISOString() } }));
  return item;
}

export const handler = async (event = {}) => {
  if (!STATION) return { skipped: "no station key" };
  const back = Math.min(Math.max(Number(event.hours) || 3, 1), 24 * 7);
  const toMs = Math.floor(Date.now() / HOUR) * HOUR; // complete hours only
  const fromMs = toMs - back * HOUR;

  const readings = await rawReadings(STATION, fromMs - RAIN_SEED_MS, toMs - 1);
  const hours = rollupHours(readings, fromMs, toMs);
  for (const h of hours) {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: hourPk(STATION, Date.parse(h.sk)), ...h } }));
  }

  const days = [...new Set(hours.map((h) => localDay(Date.parse(h.sk))))];
  for (const d of days) await rollDay(STATION, d);

  console.log(JSON.stringify({ msg: "rollup", from: isoSec(fromMs), to: isoSec(toMs), readings: readings.length, hours: hours.length, days }));
  return { hours: hours.length, days };
};
