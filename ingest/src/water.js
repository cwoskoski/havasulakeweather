/**
 * Havasu Lake Weather — lake & river conditions.
 *
 * Free, no-key government sources:
 *   • Lake Havasu level   — USGS 09427500 (gage height + 402.85 ft = NAVD88 elev)
 *   • Lake Mohave level   — USGS 09422500 (reservoir elevation, NGVD29)
 *   • Davis Dam release   — USBR RISE (inflow to Havasu)   [pinned at go-live]
 *   • Parker Dam release  — USBR RISE (outflow downstream)  [pinned at go-live]
 *
 * USGS discontinued the instantaneous release gauges below both dams, so the
 * live flow (cfs) comes from USBR RISE. RISE item ids are supplied via env
 * (RISE_DAVIS_ID / RISE_PARKER_ID); until set, flows read null and the card
 * shows "—". ?mock=<scenario> serves fixtures: normal | low-lake | high-release.
 */

import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const WATER_TABLE = process.env.TABLE_NAME;
const WATER_PK = "WATER#DAILY"; // one snapshot per day (levels, storage, temps, releases)

// Seasonal baselines (monthly percentiles from ~decades of RISE history) used to
// classify releases as low / normal / high for the current month — see HLW-014.
const NORMALS = JSON.parse(readFileSync(new URL("../data/water-normals.json", import.meta.url), "utf8"));

const UA = process.env.NWS_USER_AGENT || "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";
const HAVASU_DATUM = 402.85; // ft, gage-height → NAVD88 water-surface elevation for 09427500
const HAVASU_FULL = 450;     // ~full pool (Reclamation datum); used only for a coarse status
// USBR RISE catalog item ids — daily "Lake/Reservoir Release - Total" (cfs), pinned:
//   Davis Dam release  = inflow to Lake Havasu  (RISE item 6135, Lake Mohave record 4369)
//   Parker Dam release = outflow downstream      (RISE item 6130, Lake Havasu record 4371)
const RISE_DAVIS_ID = process.env.RISE_DAVIS_ID || "6135";
const RISE_PARKER_ID = process.env.RISE_PARKER_ID || "6130";
const RISE_HAVASU_TEMP = process.env.RISE_HAVASU_TEMP || "6127"; // Lake Havasu water temp (DegF)
const RISE_MOHAVE_TEMP = process.env.RISE_MOHAVE_TEMP || "6132"; // Lake Mohave water temp (DegF)
const RISE_HAVASU_STORAGE = process.env.RISE_HAVASU_STORAGE || "6129"; // Lake Havasu storage (acre-ft)
const RISE_MOHAVE_STORAGE = process.env.RISE_MOHAVE_STORAGE || "6134"; // Lake Mohave storage (acre-ft)

const now = () => new Date().toISOString();

async function usgsLatest(service, site, pcode, timeoutMs = 4500) {
  const url = `https://waterservices.usgs.gov/nwis/${service}/?format=json&sites=${site}&parameterCd=${pcode}&siteStatus=all`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`USGS ${service} ${site} -> ${r.status}`);
    const j = await r.json();
    const ts = (j.value && j.value.timeSeries) || [];
    if (!ts.length) return null;
    const vals = ts[0].values[0].value;
    const last = vals && vals.length ? vals[vals.length - 1] : null;
    if (!last || last.value == null) return null;
    return { value: parseFloat(last.value), at: last.dateTime };
  } finally {
    clearTimeout(t);
  }
}

// USBR RISE — latest daily value for a catalog item. RISE requires the JSON:API media
// type (Accept: application/vnd.api+json) — application/json returns a 406.
async function riseNum(itemId, timeoutMs = 5000) {
  if (!itemId) return null;
  // Date-scope the query — a plain order=desc hangs on the ~90-year series (storage,
  // elevation). We fetch recent points and take the latest.
  const after = new Date(Date.now() - 20 * 86400e3).toISOString().slice(0, 10);
  const url = `https://data.usbr.gov/rise/api/result?itemId=${itemId}&itemsPerPage=40&dateTime%5Bafter%5D=${after}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/vnd.api+json" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`RISE ${itemId} -> ${r.status}`);
    const pts = ((await r.json()).data || [])
      .map((x) => ({ at: x.attributes.dateTime, value: parseFloat(x.attributes.result) }))
      .filter((p) => p.at && Number.isFinite(p.value));
    if (!pts.length) return null;
    pts.sort((a, b) => (a.at < b.at ? -1 : 1));
    return pts[pts.length - 1];
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
// Dam release (cfs).
async function riseRelease(itemId, name) {
  const v = await riseNum(itemId);
  return v ? { name, cfs: Math.round(v.value), trend: "steady", observedAt: v.at, source: "USBR RISE" } : null;
}

function lakeStatus(elev) {
  if (elev == null) return "unknown";
  if (elev >= 449) return "full";
  if (elev >= 444) return "normal";
  return "low";
}

// --- seasonal context + warnings (HLW-014) ---
function contextFor(norm, value, month) {
  if (value == null || !norm) return null;
  const b = norm.byMonth[String(month)];
  const level = !b ? "unknown" : value < b.p10 ? "low" : value > b.p90 ? "high" : "normal";
  return { level, monthLo: b ? b.p10 : null, monthMed: b ? b.median : null, monthHi: b ? b.p90 : null, allLo: norm.allTime.min, allHi: norm.allTime.max };
}

// Recent daily series for a RISE item (oldest -> newest), or null. NB: a plain
// order=desc query on the ~90-year release series HANGS on RISE (30s+ timeouts);
// bounding the query to recent dates (?dateTime[after]=) returns in <1s.
async function riseSeries(itemId, days = 40, timeoutMs = 6000) {
  if (!itemId) return null;
  const after = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  const url = `https://data.usbr.gov/rise/api/result?itemId=${itemId}&itemsPerPage=100&dateTime%5Bafter%5D=${after}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/vnd.api+json" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`RISE ${itemId} -> ${r.status}`);
    const pts = ((await r.json()).data || [])
      .map((x) => ({ date: (x.attributes.dateTime || "").slice(0, 10), value: parseFloat(x.attributes.result) }))
      .filter((p) => p.date && Number.isFinite(p.value));
    pts.sort((a, b) => (a.date < b.date ? -1 : 1));
    return pts.length ? pts : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Latest release (cfs) + trend + seasonal context, from a recent series.
function seriesToRelease(series, name, norm, month) {
  if (!series || !series.length) return null;
  const cfs = Math.round(series[series.length - 1].value);
  const prev = series.length > 7 ? series[series.length - 8].value : series[0].value;
  const trend = cfs > prev * 1.05 ? "rising" : cfs < prev * 0.95 ? "falling" : "steady";
  return { name, cfs, trend, observedAt: series[series.length - 1].date, source: "USBR RISE", context: contextFor(norm, cfs, month) };
}

// Align Davis + Parker series by date for the mini-chart (last ~30 days).
function buildSeries(davisS, parkerS) {
  if (!davisS && !parkerS) return null;
  const dmap = new Map((davisS || []).map((p) => [p.date, p.value]));
  const pmap = new Map((parkerS || []).map((p) => [p.date, p.value]));
  const dates = [...new Set([...dmap.keys(), ...pmap.keys()])].sort().slice(-30);
  return {
    dates,
    davisIn: dates.map((d) => (dmap.has(d) ? Math.round(dmap.get(d)) : null)),
    parkerOut: dates.map((d) => (pmap.has(d) ? Math.round(pmap.get(d)) : null)),
  };
}

function warningsFor(lake, inflow, outflow) {
  const w = [];
  const n = (x) => x.toLocaleString();
  if (inflow && inflow.context && inflow.context.level === "high")
    w.push({ kind: "river", severity: "warning", text: `High flows on the Colorado below Davis Dam (${n(inflow.cfs)} cfs, high for the season) — expect stronger current.` });
  if (outflow && outflow.context && outflow.context.level === "high")
    w.push({ kind: "river", severity: "info", text: `Heavy Parker Dam releases (${n(outflow.cfs)} cfs, high for the season) downstream.` });
  if (lake && lake.status === "low")
    w.push({ kind: "lake", severity: "warning", text: "Lake Havasu is running below its normal level." });
  if (inflow && inflow.context && inflow.context.level === "low")
    w.push({ kind: "river", severity: "info", text: `Davis Dam releases are low for the season (${n(inflow.cfs)} cfs) — calmer water below the dam.` });
  return w;
}

export async function getLive() {
  const settle = async (p) => { try { return await p; } catch { return null; } };
  const month = new Date().getUTCMonth() + 1;
  const [hav, moh, davisS, parkerS, havTemp, mohTemp, havStore, mohStore] = await Promise.all([
    settle(usgsLatest("iv", "09427500", "00065", 8000)),  // Lake Havasu gage height
    settle(usgsLatest("dv", "09422500", "62614", 8000)),  // Lake Mohave elevation (NGVD29)
    settle(riseSeries(RISE_DAVIS_ID, 30)),                 // Davis release (current + chart)
    settle(riseSeries(RISE_PARKER_ID, 30)),                // Parker release (current + chart)
    settle(riseNum(RISE_HAVASU_TEMP)),
    settle(riseNum(RISE_MOHAVE_TEMP)),
    settle(riseNum(RISE_HAVASU_STORAGE)),                  // acre-ft
    settle(riseNum(RISE_MOHAVE_STORAGE)),                  // acre-ft
  ]);
  const elev = hav ? +(hav.value + HAVASU_DATUM).toFixed(2) : null;
  const lake = hav ? {
    name: "Lake Havasu", elevationFt: elev, gageFt: hav.value, fullPoolFt: HAVASU_FULL,
    status: lakeStatus(elev), storageAf: havStore ? Math.round(havStore.value) : null,
    waterTempF: havTemp ? +havTemp.value.toFixed(1) : null, observedAt: hav.at, datum: "NAVD88",
  } : null;
  const upstream = moh ? {
    name: "Lake Mohave", elevationFt: +moh.value.toFixed(2),
    storageAf: mohStore ? Math.round(mohStore.value) : null,
    waterTempF: mohTemp ? +mohTemp.value.toFixed(1) : null, observedAt: moh.at, datum: "NGVD29",
  } : null;
  const inflow = seriesToRelease(davisS, "Davis Dam release", NORMALS.davisRelease, month);
  const outflow = seriesToRelease(parkerS, "Parker Dam release", NORMALS.parkerRelease, month);
  const notes = [];
  if (!inflow && !outflow) notes.push("Dam release rates (USBR) coming soon.");
  return { source: "live", lake, upstream, inflow, outflow, series: buildSeries(davisS, parkerS), warnings: warningsFor(lake, inflow, outflow), notes };
}

// Read the latest stored snapshot (+ recent series) from DynamoDB — populated by the
// scheduled water-ingest so /api/water is fast and doesn't hit RISE at request time.
// Returns null if nothing is stored yet (then we fall back to a live fetch).
async function getFromDb() {
  try {
    const r = await ddb.send(new QueryCommand({
      TableName: WATER_TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": WATER_PK },
      ScanIndexForward: false, Limit: 35,
    }));
    const items = r.Items || [];
    return items.length ? snapshotsToResponse(items) : null;
  } catch (e) {
    console.error(JSON.stringify({ msg: "water-db-read-fail", error: String(e && e.message || e) }));
    return null;
  }
}

function snapshotsToResponse(items) {
  const latest = items[0];               // newest first
  const asc = items.slice().reverse();   // oldest -> newest
  const month = new Date().getUTCMonth() + 1;
  const lake = latest.havasuElevFt != null ? {
    name: "Lake Havasu", elevationFt: latest.havasuElevFt, fullPoolFt: HAVASU_FULL,
    status: lakeStatus(latest.havasuElevFt), storageAf: latest.havasuStorageAf ?? null,
    waterTempF: latest.havasuTempF ?? null, observedAt: latest.date, datum: "NAVD88",
  } : null;
  const upstream = latest.mohaveElevFt != null ? {
    name: "Lake Mohave", elevationFt: latest.mohaveElevFt, storageAf: latest.mohaveStorageAf ?? null,
    waterTempF: latest.mohaveTempF ?? null, observedAt: latest.date, datum: "NGVD29",
  } : null;
  const davisSeries = asc.filter((s) => s.davisCfs != null).map((s) => ({ date: s.date, value: s.davisCfs }));
  const parkerSeries = asc.filter((s) => s.parkerCfs != null).map((s) => ({ date: s.date, value: s.parkerCfs }));
  const inflow = seriesToRelease(davisSeries, "Davis Dam release", NORMALS.davisRelease, month);
  const outflow = seriesToRelease(parkerSeries, "Parker Dam release", NORMALS.parkerRelease, month);
  return { source: "stored", lake, upstream, inflow, outflow, series: buildSeries(davisSeries, parkerSeries), warnings: warningsFor(lake, inflow, outflow), notes: [] };
}

export async function getWater(mock) {
  const updatedAt = now();
  if (mock) {
    const make = MOCK[mock] || MOCK.normal;
    return { updatedAt, location: "Lake Havasu", source: "mock", mock, ...make() };
  }
  const stored = await getFromDb();
  if (stored && (stored.lake || stored.inflow)) return { updatedAt, location: "Lake Havasu", ...stored };
  // fallback: live fetch (before the ingest has populated the store)
  try {
    return { updatedAt, location: "Lake Havasu", ...(await getLive()) };
  } catch (e) {
    console.error(JSON.stringify({ msg: "water-live-fail", error: String(e && e.message || e) }));
    return { updatedAt, location: "Lake Havasu", source: "live", error: "upstream", lake: null, upstream: null, inflow: null, outflow: null, notes: [] };
  }
}

/* ------------------------------------------------------------ mock fixtures --
 * normal | low-lake | high-release. Fake, shaped like the live output.
 */
function mockLake(elev, status) {
  const storeAf = status === "low" ? 555000 : status === "normal" ? 595000 : 619000;
  return { name: "Lake Havasu", elevationFt: elev, gageFt: +(elev - HAVASU_DATUM).toFixed(2), fullPoolFt: HAVASU_FULL, status, storageAf: storeAf, waterTempF: 88.0, observedAt: now(), datum: "NAVD88" };
}
const moh = (elev) => ({ name: "Lake Mohave", elevationFt: elev, storageAf: 1650000, waterTempF: 76.0, observedAt: now(), datum: "NGVD29" });
function mockSeries(dCur, pCur) {
  const dates = [], davisIn = [], parkerOut = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    dates.push(new Date(today.getTime() - i * 86400e3).toISOString().slice(0, 10));
    const f = 1 - i / 60;
    davisIn.push(Math.round(dCur * (0.75 + 0.25 * f) + (i % 5) * 120));
    parkerOut.push(Math.round(pCur * (0.8 + 0.2 * f) + (i % 4) * 90));
  }
  return { dates, davisIn, parkerOut };
}
function mockScenario(lake, upstream, dCfs, dTrend, pCfs, pTrend) {
  const m = new Date().getUTCMonth() + 1;
  const inflow = { name: "Davis Dam release", cfs: dCfs, trend: dTrend, observedAt: now().slice(0, 10), source: "USBR RISE", context: contextFor(NORMALS.davisRelease, dCfs, m) };
  const outflow = { name: "Parker Dam release", cfs: pCfs, trend: pTrend, observedAt: now().slice(0, 10), source: "USBR RISE", context: contextFor(NORMALS.parkerRelease, pCfs, m) };
  return { lake, upstream, inflow, outflow, series: mockSeries(dCfs, pCfs), warnings: warningsFor(lake, inflow, outflow), notes: [] };
}

const MOCK = {
  "normal": () => mockScenario(mockLake(451.5, "full"), moh(643.1), 12500, "steady", 9200, "steady"),
  "low-lake": () => mockScenario(mockLake(444.2, "low"), moh(638.4), 8000, "falling", 7200, "falling"),
  "high-release": () => mockScenario(mockLake(451.0, "full"), moh(644.0), 19500, "rising", 16000, "rising"),
};
