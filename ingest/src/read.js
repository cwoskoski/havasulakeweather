/**
 * Havasu Lake Weather — read API (JSON for the public page)
 *
 *   GET /api/current                 → latest reading + derived values
 *   GET /api/history?hours=24        → time series for charts (max 30d)
 *
 * Read-only over the same DynamoDB table. Behind CloudFront + edge caching in
 * Phase 3; for now it's a Function URL you can curl. Derived values (dew point,
 * feels-like, wind compass) are computed here so storage stays raw.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getAlerts, getForecast } from "./nws.js";
import { getCompare } from "./compare.js";
import { getWater } from "./water.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME;
const STATION = (process.env.STATION_KEY || "").split(",")[0].trim();

const obsPk = (mm) => `OBS#${STATION}#${mm}`;
const ym = (d) => d.toISOString().slice(0, 7);
const prevMonth = (mm) => { let [y, m] = mm.split("-").map(Number); if (--m === 0) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const nextMonth = (mm) => { let [y, m] = mm.split("-").map(Number); if (++m === 13) { m = 1; y++; } return `${y}-${String(m).padStart(2, "0")}`; };

function res(status, body, cacheSeconds = 15) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "cache-control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    },
    body: JSON.stringify(body),
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => (deg == null ? null : COMPASS[Math.round((deg % 360) / 22.5) % 16]);

function dewPointF(tf, rh) {
  if (tf == null || rh == null || rh <= 0) return null;
  const c = (tf - 32) * 5 / 9, a = 17.27, b = 237.7;
  const g = Math.log(rh / 100) + (a * c) / (b + c);
  return +(((b * g) / (a - g)) * 9 / 5 + 32).toFixed(1);
}
function feelsLikeF(tf, rh, mph) {
  if (tf == null) return null;
  if (tf >= 80 && rh != null) {
    const hi = -42.379 + 2.04901523 * tf + 10.14333127 * rh - 0.22475541 * tf * rh
      - 6.83783e-3 * tf * tf - 5.481717e-2 * rh * rh + 1.22874e-3 * tf * tf * rh
      + 8.5282e-4 * tf * rh * rh - 1.99e-6 * tf * tf * rh * rh;
    return +hi.toFixed(1);
  }
  if (tf <= 50 && mph != null && mph > 3) {
    const v = Math.pow(mph, 0.16);
    return +(35.74 + 0.6215 * tf - 35.75 * v + 0.4275 * tf * v).toFixed(1);
  }
  return tf;
}

async function newest() {
  const now = new Date();
  for (const mm of [ym(now), prevMonth(ym(now))]) {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": obsPk(mm) }, ScanIndexForward: false, Limit: 1,
    }));
    if (r.Items?.length) return r.Items[0];
  }
  return null;
}

async function series(hours) {
  const now = new Date();
  const startISO = new Date(now - hours * 3600e3).toISOString().slice(0, 19) + "Z";
  const months = [ym(new Date(now - hours * 3600e3))];
  while (months[months.length - 1] !== ym(now) && months.length < 14) months.push(nextMonth(months[months.length - 1]));
  const items = [];
  for (const mm of months) {
    let ek;
    do {
      const r = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk AND sk >= :s",
        ExpressionAttributeValues: { ":pk": obsPk(mm), ":s": startISO },
        ProjectionExpression: "sk, tempf, windspeedmph, windgustmph, winddir, humidity, baromrelin, uv, solarradiation, dailyrainin",
        ExclusiveStartKey: ek,
      }));
      items.push(...(r.Items || []));
      ek = r.LastEvaluatedKey;
    } while (ek);
  }
  items.sort((a, b) => (a.sk < b.sk ? -1 : 1));
  return items;
}

export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET";
  const path = event?.rawPath || event?.requestContext?.http?.path || "/";
  const qs = event?.queryStringParameters || {};
  if (method === "OPTIONS") return res(204, {}, 3600);

  try {
    if (path.endsWith("/api/current")) {
      const it = await newest();
      if (!it) return res(200, { station: STATION, reading: null }, 15);
      const tf = it.tempf, rh = it.humidity;
      const ageSec = it.receivedAt ? (Date.now() - Date.parse(it.receivedAt)) / 1000 : null;
      return res(200, {
        station: STATION,
        observedAt: it.dateutc,
        receivedAt: it.receivedAt,
        stale: ageSec != null && ageSec > 600,
        temperatureF: tf,
        feelsLikeF: feelsLikeF(tf, rh, it.windspeedmph),
        humidity: rh,
        dewPointF: dewPointF(tf, rh),
        wind: { speedMph: it.windspeedmph, gustMph: it.windgustmph, maxDailyGustMph: it.maxdailygust, directionDeg: it.winddir, compass: compass(it.winddir) },
        pressureInHg: it.baromrelin,
        uv: it.uv,
        solarWm2: it.solarradiation,
        rain: { rainingNow: !!it.rainingNow, lastRainAt: it.lastRainAt ?? null, todayIn: it.dailyrainin, monthIn: it.monthlyrainin, yearIn: it.yearlyrainin },
      }, 30);
    }

    if (path.endsWith("/api/history")) {
      let hours = parseInt(qs.hours || "24", 10);
      if (!Number.isFinite(hours) || hours <= 0) hours = 24;
      hours = Math.min(hours, 24 * 30);
      const its = await series(hours);
      return res(200, {
        station: STATION, hours, count: its.length,
        points: its.map((r) => ({
          t: r.sk, tempF: r.tempf, windMph: r.windspeedmph, gustMph: r.windgustmph,
          dirDeg: r.winddir, humidity: r.humidity, pressureInHg: r.baromrelin,
          uv: r.uv, solarWm2: r.solarradiation, rainTodayIn: r.dailyrainin,
        })),
      }, 120);
    }

    // NWS forecast + alerts (free, no key). ?mock=<scenario> returns fixtures.
    // Soft-fail on upstream errors so a flaky NWS never breaks the page.
    if (path.endsWith("/api/alerts")) {
      try {
        return res(200, await getAlerts(qs.mock), qs.mock ? 20 : 300);
      } catch (e) {
        console.error(JSON.stringify({ msg: "alerts-upstream", error: String(e?.message || e) }));
        return res(200, { source: "NWS", count: 0, alerts: [], error: "upstream" }, 30);
      }
    }

    if (path.endsWith("/api/forecast")) {
      try {
        return res(200, await getForecast(qs.mock), qs.mock ? 20 : 900);
      } catch (e) {
        console.error(JSON.stringify({ msg: "forecast-upstream", error: String(e?.message || e) }));
        return res(200, { source: "NWS", hourly: [], daily: [], rainSoon: { likely: false }, error: "upstream" }, 30);
      }
    }

    // Compare our station against a nearby WU PWS (QA / drift check).
    // ?mock=agree|drift|offline works now; live needs WU_API_KEY.
    if (path.endsWith("/api/compare")) {
      try {
        let mine = null;
        if (!qs.mock) {
          const it = await newest();
          if (it) {
            const ageSec = it.receivedAt ? (Date.now() - Date.parse(it.receivedAt)) / 1000 : null;
            mine = {
              id: STATION, label: "Havasu Lake (mine)",
              tempF: it.tempf, windMph: it.windspeedmph, humidity: it.humidity,
              pressureInHg: it.baromrelin, rainTodayIn: it.dailyrainin,
              observedAt: it.dateutc, stale: ageSec != null && ageSec > 600,
            };
          }
        }
        return res(200, await getCompare(qs.mock, mine), qs.mock ? 20 : 300);
      } catch (e) {
        console.error(JSON.stringify({ msg: "compare-upstream", error: String(e?.message || e) }));
        return res(200, { source: "live", stations: { mine: null, nearby: null }, error: "upstream" }, 30);
      }
    }

    // Lake & river conditions (USGS levels + USBR RISE releases).
    // ?mock=normal|low-lake|high-release works now; live levels are real.
    if (path.endsWith("/api/water")) {
      try {
        return res(200, await getWater(qs.mock), qs.mock ? 20 : 1800);
      } catch (e) {
        console.error(JSON.stringify({ msg: "water-upstream", error: String(e?.message || e) }));
        return res(200, { source: "live", lake: null, upstream: null, inflow: null, outflow: null, error: "upstream" }, 60);
      }
    }

    return res(404, { error: "not found", try: ["/api/current", "/api/history?hours=24", "/api/forecast", "/api/alerts", "/api/compare", "/api/water"] }, 15);
  } catch (e) {
    console.error(JSON.stringify({ msg: "read-error", error: String(e?.message || e), path }));
    return res(500, { error: "internal" }, 5);
  }
};
