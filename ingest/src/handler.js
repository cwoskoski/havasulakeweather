/**
 * Havasu Lake Weather — ingest Lambda (Phase 2: storage, watermark pattern)
 *
 * Ambient console --HTTP:80--> CloudFront --HTTPS--> (this) --> DynamoDB.
 *
 * Stores OUTDOOR readings only (indoor console temp/humidity dropped), deduped
 * on station key + dateutc. Because the console posts every ~60s the container
 * stays warm, so we keep the last reading in an in-memory WATERMARK and compute
 * "raining now / last rain" from it — steady state is ONE DynamoDB write per
 * reading with no read on the hot path. Only a cold start does a seed query.
 *
 * Table (single):
 *   time-series item:  pk = OBS#<stationKey>#YYYY-MM,  sk = <dateutc ISO>
 *   Each item carries rainingNow + lastRainAt, so "current" reads = newest item.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = process.env.TABLE_NAME;
const ALLOWED = (process.env.ALLOWED_STATION_KEYS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Indoor console readings we deliberately don't store.
const DROP = new Set(["tempinf", "humidityin", "battin"]);
// Fields stored as Numbers (everything else stays a string).
const NUMERIC = new Set([
  "tempf", "humidity", "windspeedmph", "windgustmph", "maxdailygust", "winddir",
  "uv", "solarradiation", "hourlyrainin", "eventrainin", "dailyrainin",
  "weeklyrainin", "monthlyrainin", "yearlyrainin", "totalrainin",
  "baromrelin", "baromabsin", "battout",
]);

// In-memory watermark, survives across warm invocations (~1/min keeps us warm):
// { dateutc, totalrainin, lastRainAt }. Null until the first invocation seeds it.
let mark = null;

const ok = () => ({ statusCode: 200, headers: { "content-type": "text/plain" }, body: "success\n" });
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : v; };
const obsPk = (key, yyyymm) => `OBS#${key}#${yyyymm}`;
const prevMonth = (yyyymm) => {
  let [y, m] = yyyymm.split("-").map(Number);
  if (--m === 0) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
};

function parseParams(event) {
  const q = event?.queryStringParameters;
  if (q && Object.keys(q).length) return q;
  // Fallback: some firmware jams params into the path with no '?'.
  const raw = event?.rawPath || "";
  const i = raw.search(/[?&]/);
  return i < 0 ? {} : Object.fromEntries(new URLSearchParams(raw.slice(i + 1)));
}

// Cold-start seed: newest stored reading (this month, else previous month).
async function seedFromDb(stationKey, yyyymm) {
  for (const mm of [yyyymm, prevMonth(yyyymm)]) {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": obsPk(stationKey, mm) },
      ScanIndexForward: false,
      Limit: 1,
    }));
    if (r.Items?.length) {
      const it = r.Items[0];
      return { dateutc: it.dateutc, totalrainin: it.totalrainin, lastRainAt: it.lastRainAt ?? null };
    }
  }
  return null;
}

export const handler = async (event) => {
  const receivedAt = new Date().toISOString();
  const p = parseParams(event);
  const stationKey = p.PASSKEY;
  const dateutc = p.dateutc;

  if (!stationKey || !dateutc) {
    console.log(JSON.stringify({ msg: "skip-incomplete", receivedAt, keys: Object.keys(p) }));
    return ok();
  }
  if (ALLOWED.length && !ALLOWED.includes(stationKey)) {
    console.log(JSON.stringify({ msg: "skip-unlisted", receivedAt, stationKey }));
    return ok();
  }

  const iso = dateutc.replace(" ", "T") + "Z";
  const yyyymm = iso.slice(0, 7);

  const reading = { stationKey, dateutc: iso, receivedAt };
  for (const [k, v] of Object.entries(p)) {
    if (k === "PASSKEY" || k === "dateutc" || DROP.has(k)) continue;
    reading[k] = NUMERIC.has(k) ? num(v) : v;
  }

  try {
    if (!mark) mark = await seedFromDb(stationKey, yyyymm); // cold start only

    let rainingNow = false;
    let lastRainAt = mark?.lastRainAt ?? null;
    if (mark && typeof reading.totalrainin === "number" && typeof mark.totalrainin === "number"
        && reading.totalrainin > mark.totalrainin + 1e-9) {
      rainingNow = true;
      lastRainAt = receivedAt;
    }
    reading.rainingNow = rainingNow;
    reading.lastRainAt = lastRainAt;

    // ONE write per reading — idempotent on (pk, sk) so retries don't duplicate.
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { pk: obsPk(stationKey, yyyymm), sk: iso, ...reading },
      ConditionExpression: "attribute_not_exists(pk)",
    })).catch((e) => { if (e.name !== "ConditionalCheckFailedException") throw e; });

    // Advance the watermark (forward only; ignores retries/out-of-order posts).
    if (!mark || iso > mark.dateutc) {
      mark = { dateutc: iso, totalrainin: reading.totalrainin, lastRainAt };
    }

    console.log(JSON.stringify({ msg: "stored", stationKey, dateutc: iso, tempf: reading.tempf, rainingNow }));
  } catch (e) {
    console.error(JSON.stringify({ msg: "store-error", error: String(e?.message || e), dateutc: iso }));
    // Still 200 — station stays happy; AWN + logs are the backstop.
  }
  return ok();
};
