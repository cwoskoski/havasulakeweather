/**
 * HLW-018 — build historical stats from the backfilled WATER#DAILY record.
 *
 * Reads every stored daily snapshot (HLW-017 backfill) once and emits two static files:
 *
 *   ingest/data/water-history.json  (NEW)
 *     Per-month distribution of PER-YEAR monthly-median values, for storage + releases,
 *     plus the per-year series itself. Drives the "lower than N% of past <month>s"
 *     callout and the decades sparkline on /water. Fill-period years excluded per series.
 *
 *   ingest/data/water-normals.json  (REGEN of HLW-014, previously a ~7yr sample)
 *     Per-month percentile bands of DAILY release values (Davis/Parker), used to label a
 *     single day's flow low/normal/high. Now computed from the full ~90yr record.
 *
 * Run locally with the havasu SSO profile:
 *   AWS_PROFILE=havasu AWS_REGION=us-west-2 node ingest/scripts/build-history-stats.mjs
 */

import { writeFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "us-west-2" }));
const TABLE = process.env.TABLE_NAME || "havasu-weather";
const TODAY = new Date().toISOString().slice(0, 10);

// Reservoir normal-operations start year (exclude the initial fill, which isn't a "drought low").
// Parker Dam op ~1938 (Havasu fill done ~1940); Davis Dam op 1951; Mohave fill done ~1954.
// Mead fill done ~1941; Powell took until ~1980 to first fill, so its "vs history" starts 1981.
const SINCE = { havasuStorageAf: 1945, mohaveStorageAf: 1955, davisCfs: 1952, parkerCfs: 1941, meadStorageAf: 1945, powellStorageAf: 1981 };
const STORAGE_FIELDS = ["havasuStorageAf", "mohaveStorageAf", "meadStorageAf", "powellStorageAf"];
const RELEASE_FIELDS = ["davisCfs", "parkerCfs"];
const ALL_FIELDS = [...STORAGE_FIELDS, ...RELEASE_FIELDS];

const RISE_META = {
  davisCfs: { riseItem: "6135", unit: "cfs" },
  parkerCfs: { riseItem: "6130", unit: "cfs" },
};

function pct(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}
const median = (s) => pct(s, 0.5);

async function loadAll() {
  const rows = [];
  let key;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": "WATER#DAILY" },
      ProjectionExpression: "sk, havasuStorageAf, mohaveStorageAf, meadStorageAf, powellStorageAf, davisCfs, parkerCfs",
      ExclusiveStartKey: key,
    }));
    rows.push(...(r.Items || []));
    key = r.LastEvaluatedKey;
  } while (key);
  return rows;
}

function build(rows) {
  // group[field][year][month] = [values...]
  const group = {};
  for (const f of ALL_FIELDS) group[f] = new Map();
  for (const it of rows) {
    const [y, m] = it.sk.split("-");
    for (const f of ALL_FIELDS) {
      const v = it[f];
      if (v == null) continue;
      if (+y < SINCE[f]) continue;
      const ym = group[f];
      if (!ym.has(y)) ym.set(y, new Map());
      const mm = ym.get(y);
      if (!mm.has(m)) mm.set(m, []);
      mm.get(m).push(Number(v));
    }
  }

  // ---- water-history.json: per-year monthly-median distribution per month ----
  const history = { generatedAt: TODAY, note: "Per-year monthly-median distributions from stored WATER#DAILY (HLW-017). Percentiles = position of a current value among past years for that month.", series: {} };
  for (const f of ALL_FIELDS) {
    const byMonth = {};
    let firstYear = 9999, lastYear = 0;
    for (let m = 1; m <= 12; m++) {
      const mk = String(m).padStart(2, "0");
      const years = [];
      for (const [y, mm] of group[f]) {
        const vals = mm.get(mk);
        if (vals && vals.length) { years.push([+y, median(vals.slice().sort((a, b) => a - b))]); firstYear = Math.min(firstYear, +y); lastYear = Math.max(lastYear, +y); }
      }
      years.sort((a, b) => a[0] - b[0]);
      const vs = years.map((x) => x[1]).sort((a, b) => a - b);
      byMonth[String(m)] = years.length ? {
        nYears: years.length, p10: pct(vs, 0.1), median: median(vs), p90: pct(vs, 0.9), min: vs[0], max: vs[vs.length - 1],
        years, // [ [year, monthlyMedian], ... ] — for percentile + sparkline
      } : null;
    }
    history.series[f] = { sinceYear: SINCE[f], firstYear: firstYear === 9999 ? null : firstYear, lastYear: lastYear || null, byMonth };
  }

  // ---- water-normals.json: DAILY release percentile bands (regen from full record) ----
  const normals = { computedFrom: `USBR RISE daily observations (full record via stored WATER#DAILY, through ${TODAY})` };
  for (const f of RELEASE_FIELDS) {
    const key = f === "davisCfs" ? "davisRelease" : "parkerRelease";
    const allVals = [];
    const byMonth = {};
    for (let m = 1; m <= 12; m++) {
      const mk = String(m).padStart(2, "0");
      const monthVals = [];
      for (const [, mm] of group[f]) { const vals = mm.get(mk); if (vals) monthVals.push(...vals); }
      monthVals.sort((a, b) => a - b);
      byMonth[String(m)] = monthVals.length ? { p10: pct(monthVals, 0.1), median: median(monthVals), p90: pct(monthVals, 0.9) } : null;
      allVals.push(...monthVals);
    }
    allVals.sort((a, b) => a - b);
    let n = 0; for (const [, mm] of group[f]) for (const [, v] of mm) n += v.length;
    normals[key] = {
      riseItem: RISE_META[f].riseItem, unit: RISE_META[f].unit,
      sampleFrom: `${SINCE[f]}-01-01`, sampleTo: TODAY, n,
      allTime: { min: allVals[0], p10: pct(allVals, 0.1), median: median(allVals), p90: pct(allVals, 0.9), max: allVals[allVals.length - 1] },
      byMonth,
    };
  }

  return { history, normals };
}

const rows = await loadAll();
console.log(`Loaded ${rows.length} WATER#DAILY rows.`);
const { history, normals } = build(rows);

for (const f of ALL_FIELDS) {
  const s = history.series[f], aug = s.byMonth["8"];
  console.log(`  ${f.padEnd(16)} since ${s.sinceYear} | ${s.firstYear}–${s.lastYear} | Aug ${aug ? `${aug.nYears}yr med ${aug.median.toLocaleString()} [${aug.min.toLocaleString()}..${aug.max.toLocaleString()}]` : "n/a"}`);
}

writeFileSync(new URL("../data/water-history.json", import.meta.url), JSON.stringify(history));
writeFileSync(new URL("../data/water-normals.json", import.meta.url), JSON.stringify(normals, null, 2) + "\n");
console.log("Wrote ingest/data/water-history.json + regenerated ingest/data/water-normals.json");
