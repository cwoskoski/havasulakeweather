/**
 * Havasu Lake Weather — nearby PWS ingest (scheduled).
 *
 * Pulls the current observation for one or more nearby Weather Underground
 * PWS stations (default KCAHAVAS2) every ~15 min and stores it in the same
 * DynamoDB table as our own readings, under pk = OBS#<stationId>#YYYY-MM,
 * so we accumulate history for side-by-side comparison and drift detection.
 *
 * Needs a WU read key (api.weather.com) in WU_API_KEY. Until that's set the
 * handler no-ops (logs pws-skip-no-key) — the schedule can run harmlessly.
 * Idempotent: one item per obsTimeUtc via a conditional put.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const WU_KEY = process.env.WU_API_KEY || "";
const STATIONS = (process.env.PWS_STATIONS || "KCAHAVAS2").split(",").map((s) => s.trim()).filter(Boolean);

const ym = (iso) => (iso || new Date().toISOString()).slice(0, 7);

async function fetchCurrent(stationId) {
  const url = `https://api.weather.com/v2/pws/observations/current?stationId=${stationId}&format=json&units=e&apiKey=${WU_KEY}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`WU ${stationId} -> ${r.status}`);
  const j = await r.json();
  return (j.observations || [])[0] || null;
}

function toItem(stationId, o) {
  const im = o.imperial || {};
  const obsAt = o.obsTimeUtc;
  return {
    pk: `OBS#${stationId}#${ym(obsAt)}`,
    sk: obsAt,
    source: "WU",
    stationId,
    obsTimeUtc: obsAt,
    obsTimeLocal: o.obsTimeLocal ?? null,
    receivedAt: new Date().toISOString(),
    tempf: im.temp ?? null,
    dewptf: im.dewpt ?? null,
    humidity: o.humidity ?? null,
    windspeedmph: im.windSpeed ?? null,
    windgustmph: im.windGust ?? null,
    winddir: o.winddir ?? null,
    baromrelin: im.pressure ?? null,
    dailyrainin: im.precipTotal ?? null,
    rainratein: im.precipRate ?? null,
    solarradiation: o.solarRadiation ?? null,
    uv: o.uv ?? null,
    lat: o.lat ?? null,
    lon: o.lon ?? null,
  };
}

export const handler = async () => {
  if (!WU_KEY) {
    console.log(JSON.stringify({ msg: "pws-skip-no-key", stations: STATIONS }));
    return { stored: 0, skipped: "no-key" };
  }
  let stored = 0;
  for (const st of STATIONS) {
    try {
      const o = await fetchCurrent(st);
      if (!o || !o.obsTimeUtc) {
        console.log(JSON.stringify({ msg: "pws-no-obs", station: st }));
        continue;
      }
      const item = toItem(st, o);
      try {
        await ddb.send(new PutCommand({ TableName: TABLE, Item: item, ConditionExpression: "attribute_not_exists(pk)" }));
        stored++;
        console.log(JSON.stringify({ msg: "pws-stored", station: st, sk: item.sk, tempf: item.tempf }));
      } catch (e) {
        if (e.name !== "ConditionalCheckFailedException") throw e; // already have this observation
      }
    } catch (e) {
      console.error(JSON.stringify({ msg: "pws-error", station: st, error: String(e?.message || e) }));
    }
  }
  return { stored };
};
