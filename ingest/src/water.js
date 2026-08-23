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
// Per-year monthly-median distributions from the full backfilled record (HLW-018) — used to
// place today's storage against decades of the same month ("lower than N% of past Augusts").
const HISTORY = JSON.parse(readFileSync(new URL("../data/water-history.json", import.meta.url), "utf8"));
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
// HLW-023 — upstream cascade: Lake Powell (Glen Canyon) + Lake Mead (Hoover) via RISE, and the
// Grand Canyon reach via USGS Lees Ferry (09380000 — flow 00060 + water temp 00010, cold below
// the dam). One connector flow per reservoir gap. No RISE water-temp exists for Powell/Mead.
const RISE_POWELL_ELEV = process.env.RISE_POWELL_ELEV || "508";
const RISE_POWELL_STORAGE = process.env.RISE_POWELL_STORAGE || "509";
const RISE_MEAD_ELEV = process.env.RISE_MEAD_ELEV || "6123";
const RISE_MEAD_STORAGE = process.env.RISE_MEAD_STORAGE || "6124";
const RISE_HOOVER_RELEASE = process.env.RISE_HOOVER_RELEASE || "6125";
const RISE_POWELL_INFLOW = process.env.RISE_POWELL_INFLOW || "511"; // Upper Colorado into Lake Powell (cfs)
const USGS_GRANDCANYON = "09380000"; // Colorado R. at Lees Ferry, below Glen Canyon Dam
// Full-pool reference (elevation ft / live-storage capacity acre-ft) for a coarse "% full".
// Approximate published capacities — for the % readout only, not authoritative accounting.
const POOL = {
  powell: { fullElevFt: 3700, capacityAf: 24322000 },
  mead:   { fullElevFt: 1229, capacityAf: 26120000 },
  mohave: { fullElevFt: 647,  capacityAf: 1810000 },
  havasu: { fullElevFt: 450,  capacityAf: 619000 },
};

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

// Place a current value against decades of the same calendar month (HLW-018). Returns the
// percentile (share of past years whose monthly-median was below it), the count/start of the
// record used, and the per-year series for the sparkline. null when we have no history.
function historyFor(field, value, month) {
  if (value == null) return null;
  const s = HISTORY.series[field];
  const b = s && s.byMonth[String(month)];
  if (!b || !b.years || !b.years.length) return null;
  const meds = b.years.map((y) => y[1]);
  const below = meds.filter((v) => v < value).length;
  return {
    percentile: Math.round((100 * below) / meds.length),
    nYears: b.nYears, sinceYear: s.sinceYear, monthName: MONTH_NAMES[month - 1],
    median: b.median, min: b.min, max: b.max, current: Math.round(value),
    sparkline: b.years, // [[year, monthlyMedian], ...] oldest -> newest
  };
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

// --- Colorado cascade (HLW-023): ordered Powell → Havasu ---
function pctFull(storageAf, capacityAf) {
  return storageAf != null && capacityAf ? Math.round((100 * storageAf) / capacityAf) : null;
}
// Net flow (in − out) → rising / draining. ±200 cfs deadband so run-of-river lakes
// (Mohave/Havasu, which pass water through) don't flicker around zero.
function netFlow(inCfs, outCfs) {
  if (inCfs == null || outCfs == null) return null;
  const n = Math.round(inCfs - outCfs);
  return { netCfs: n, trend: n > 200 ? "rising" : n < -200 ? "draining" : "steady" };
}
function reservoirNode(key, name, dam, o) {
  if (o.elevFt == null && o.storageAf == null) return null;
  const pool = POOL[key] || {};
  return {
    type: "reservoir", key, name, dam,
    elevationFt: o.elevFt ?? null, storageAf: o.storageAf ?? null,
    fullElevFt: pool.fullElevFt ?? null, fullStorageAf: pool.capacityAf ?? null,
    pctFull: pctFull(o.storageAf, pool.capacityAf),
    netCfs: o.net ? o.net.netCfs : null, netTrend: o.net ? o.net.trend : null,
    waterTempF: o.tempF ?? null, star: !!o.star, observedAt: o.observedAt ?? null,
  };
}
function flowNode(key, name, sub, o) {
  if (o.cfs == null) return null;
  return { type: "flow", key, name, sub, cfs: Math.round(o.cfs), trend: o.trend ?? null, context: o.context ?? null, waterTempF: o.tempF ?? null, observedAt: o.observedAt ?? null };
}
// Assemble the ordered cascade from primitive values, dropping any node we have no data for.
// Each reservoir's net = (flow in, above it) − (its dam release, below it). Powell's "in" is
// its Upper-Colorado inflow (nothing else is above it).
function buildCascade(v) {
  return [
    reservoirNode("powell", "Lake Powell", "Glen Canyon Dam", { elevFt: v.powellElevFt, storageAf: v.powellStorageAf, net: netFlow(v.powellInflowCfs, v.canyonCfs), observedAt: v.powellAt }),
    flowNode("grandcanyon", "Grand Canyon", "below Glen Canyon Dam", { cfs: v.canyonCfs, tempF: v.canyonTempF, observedAt: v.canyonAt }),
    reservoirNode("mead", "Lake Mead", "Hoover Dam", { elevFt: v.meadElevFt, storageAf: v.meadStorageAf, net: netFlow(v.canyonCfs, v.hooverCfs), observedAt: v.meadAt }),
    flowNode("hoover", "Hoover Dam", "into Lake Mohave", { cfs: v.hooverCfs, observedAt: v.hooverAt }),
    reservoirNode("mohave", "Lake Mohave", "Davis Dam", { elevFt: v.mohaveElevFt, storageAf: v.mohaveStorageAf, tempF: v.mohaveTempF, net: netFlow(v.hooverCfs, v.davisCfs), observedAt: v.mohaveAt }),
    flowNode("davis", "Davis Dam", "into Lake Havasu", { cfs: v.davisCfs, trend: v.davisTrend, context: v.davisCtx, observedAt: v.davisAt }),
    reservoirNode("havasu", "Lake Havasu", "Parker Dam", { elevFt: v.havasuElevFt, storageAf: v.havasuStorageAf, tempF: v.havasuTempF, star: true, net: netFlow(v.davisCfs, v.parkerCfs), observedAt: v.havasuAt }),
    flowNode("parker", "Parker Dam", "downstream to Parker", { cfs: v.parkerCfs, trend: v.parkerTrend, context: v.parkerCtx, observedAt: v.parkerAt }),
  ].filter(Boolean);
}

export async function getLive() {
  const settle = async (p) => { try { return await p; } catch { return null; } };
  const month = new Date().getUTCMonth() + 1;
  const [hav, moh, davisS, parkerS, havTemp, mohTemp, havStore, mohStore,
         pElev, pStore, mElev, mStore, hoov, canyonF, canyonT, pInflow] = await Promise.all([
    settle(usgsLatest("iv", "09427500", "00065", 8000)),  // Lake Havasu gage height
    settle(usgsLatest("dv", "09422500", "62614", 8000)),  // Lake Mohave elevation (NGVD29)
    settle(riseSeries(RISE_DAVIS_ID, 30)),                 // Davis release (current + chart)
    settle(riseSeries(RISE_PARKER_ID, 30)),                // Parker release (current + chart)
    settle(riseNum(RISE_HAVASU_TEMP)),
    settle(riseNum(RISE_MOHAVE_TEMP)),
    settle(riseNum(RISE_HAVASU_STORAGE)),                  // acre-ft
    settle(riseNum(RISE_MOHAVE_STORAGE)),                  // acre-ft
    settle(riseNum(RISE_POWELL_ELEV)),                     // Lake Powell elevation (ft)
    settle(riseNum(RISE_POWELL_STORAGE)),                  // Lake Powell storage (af)
    settle(riseNum(RISE_MEAD_ELEV)),                       // Lake Mead elevation (ft)
    settle(riseNum(RISE_MEAD_STORAGE)),                    // Lake Mead storage (af)
    settle(riseNum(RISE_HOOVER_RELEASE)),                  // Hoover Dam release (cfs)
    settle(usgsLatest("iv", USGS_GRANDCANYON, "00060", 8000)), // Grand Canyon flow (cfs)
    settle(usgsLatest("iv", USGS_GRANDCANYON, "00010", 8000)), // Grand Canyon water temp (°C)
    settle(riseNum(RISE_POWELL_INFLOW)),                       // Upper Colorado into Lake Powell (cfs)
  ]);
  const elev = hav ? +(hav.value + HAVASU_DATUM).toFixed(2) : null;
  const lake = hav ? {
    name: "Lake Havasu", elevationFt: elev, gageFt: hav.value, fullPoolFt: HAVASU_FULL,
    status: lakeStatus(elev), storageAf: havStore ? Math.round(havStore.value) : null,
    waterTempF: havTemp ? +havTemp.value.toFixed(1) : null, observedAt: hav.at, datum: "NAVD88",
  } : null;
  if (lake && lake.storageAf != null) lake.history = historyFor("havasuStorageAf", lake.storageAf, month);
  const upstream = moh ? {
    name: "Lake Mohave", elevationFt: +moh.value.toFixed(2),
    storageAf: mohStore ? Math.round(mohStore.value) : null,
    waterTempF: mohTemp ? +mohTemp.value.toFixed(1) : null, observedAt: moh.at, datum: "NGVD29",
  } : null;
  const inflow = seriesToRelease(davisS, "Davis Dam release", NORMALS.davisRelease, month);
  const outflow = seriesToRelease(parkerS, "Parker Dam release", NORMALS.parkerRelease, month);
  const cascade = buildCascade({
    powellElevFt: pElev ? +pElev.value.toFixed(2) : null, powellStorageAf: pStore ? Math.round(pStore.value) : null, powellInflowCfs: pInflow ? Math.round(pInflow.value) : null, powellAt: (pElev || pStore || {}).at,
    canyonCfs: canyonF ? canyonF.value : null, canyonTempF: canyonT ? +(canyonT.value * 9 / 5 + 32).toFixed(1) : null, canyonAt: (canyonF || {}).at,
    meadElevFt: mElev ? +mElev.value.toFixed(2) : null, meadStorageAf: mStore ? Math.round(mStore.value) : null, meadAt: (mElev || mStore || {}).at,
    hooverCfs: hoov ? hoov.value : null, hooverAt: (hoov || {}).at,
    mohaveElevFt: upstream ? upstream.elevationFt : null, mohaveStorageAf: upstream ? upstream.storageAf : null, mohaveTempF: upstream ? upstream.waterTempF : null, mohaveAt: upstream ? upstream.observedAt : null,
    davisCfs: inflow ? inflow.cfs : null, davisTrend: inflow ? inflow.trend : null, davisCtx: inflow ? inflow.context : null, davisAt: inflow ? inflow.observedAt : null,
    havasuElevFt: lake ? lake.elevationFt : null, havasuStorageAf: lake ? lake.storageAf : null, havasuTempF: lake ? lake.waterTempF : null, havasuAt: lake ? lake.observedAt : null,
    parkerCfs: outflow ? outflow.cfs : null, parkerTrend: outflow ? outflow.trend : null, parkerCtx: outflow ? outflow.context : null, parkerAt: outflow ? outflow.observedAt : null,
  });
  const notes = [];
  if (!inflow && !outflow) notes.push("Dam release rates (USBR) coming soon.");
  return { source: "live", lake, upstream, inflow, outflow, cascade, powellInflowCfs: pInflow ? Math.round(pInflow.value) : null, series: buildSeries(davisS, parkerS), warnings: warningsFor(lake, inflow, outflow), notes };
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
  if (lake && lake.storageAf != null) lake.history = historyFor("havasuStorageAf", lake.storageAf, month);
  const upstream = latest.mohaveElevFt != null ? {
    name: "Lake Mohave", elevationFt: latest.mohaveElevFt, storageAf: latest.mohaveStorageAf ?? null,
    waterTempF: latest.mohaveTempF ?? null, observedAt: latest.date, datum: "NGVD29",
  } : null;
  const davisSeries = asc.filter((s) => s.davisCfs != null).map((s) => ({ date: s.date, value: s.davisCfs }));
  const parkerSeries = asc.filter((s) => s.parkerCfs != null).map((s) => ({ date: s.date, value: s.parkerCfs }));
  const inflow = seriesToRelease(davisSeries, "Davis Dam release", NORMALS.davisRelease, month);
  const outflow = seriesToRelease(parkerSeries, "Parker Dam release", NORMALS.parkerRelease, month);
  const cascade = buildCascade({
    powellElevFt: latest.powellElevFt ?? null, powellStorageAf: latest.powellStorageAf ?? null, powellInflowCfs: latest.powellInflowCfs ?? null, powellAt: latest.date,
    canyonCfs: latest.canyonCfs ?? null, canyonTempF: latest.canyonTempF ?? null, canyonAt: latest.date,
    meadElevFt: latest.meadElevFt ?? null, meadStorageAf: latest.meadStorageAf ?? null, meadAt: latest.date,
    hooverCfs: latest.hooverCfs ?? null, hooverAt: latest.date,
    mohaveElevFt: latest.mohaveElevFt ?? null, mohaveStorageAf: latest.mohaveStorageAf ?? null, mohaveTempF: latest.mohaveTempF ?? null, mohaveAt: latest.date,
    davisCfs: inflow ? inflow.cfs : latest.davisCfs, davisTrend: inflow ? inflow.trend : null, davisCtx: inflow ? inflow.context : null, davisAt: latest.date,
    havasuElevFt: latest.havasuElevFt ?? null, havasuStorageAf: latest.havasuStorageAf ?? null, havasuTempF: latest.havasuTempF ?? null, havasuAt: latest.date,
    parkerCfs: outflow ? outflow.cfs : latest.parkerCfs, parkerTrend: outflow ? outflow.trend : null, parkerCtx: outflow ? outflow.context : null, parkerAt: latest.date,
  });
  return { source: "stored", lake, upstream, inflow, outflow, cascade, series: buildSeries(davisSeries, parkerSeries), warnings: warningsFor(lake, inflow, outflow), notes: [] };
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
  const m = new Date().getUTCMonth() + 1;
  return { name: "Lake Havasu", elevationFt: elev, gageFt: +(elev - HAVASU_DATUM).toFixed(2), fullPoolFt: HAVASU_FULL, status, storageAf: storeAf, waterTempF: 88.0, observedAt: now(), datum: "NAVD88", history: historyFor("havasuStorageAf", storeAf, m) };
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
function mockCascade(lake, upstream, dCfs, pCfs) {
  return buildCascade({
    powellElevFt: 3519, powellStorageAf: 5203670, powellInflowCfs: 4742, powellAt: now(),
    canyonCfs: 7970, canyonTempF: 69.4, canyonAt: now(),
    meadElevFt: 1039.3, meadStorageAf: 6930260, meadAt: now(),
    hooverCfs: 4871, hooverAt: now(),
    mohaveElevFt: upstream.elevationFt, mohaveStorageAf: upstream.storageAf, mohaveTempF: upstream.waterTempF, mohaveAt: now(),
    davisCfs: dCfs, davisAt: now(),
    havasuElevFt: lake.elevationFt, havasuStorageAf: lake.storageAf, havasuTempF: lake.waterTempF, havasuAt: now(),
    parkerCfs: pCfs, parkerAt: now(),
  });
}
function mockScenario(lake, upstream, dCfs, dTrend, pCfs, pTrend) {
  const m = new Date().getUTCMonth() + 1;
  const inflow = { name: "Davis Dam release", cfs: dCfs, trend: dTrend, observedAt: now().slice(0, 10), source: "USBR RISE", context: contextFor(NORMALS.davisRelease, dCfs, m) };
  const outflow = { name: "Parker Dam release", cfs: pCfs, trend: pTrend, observedAt: now().slice(0, 10), source: "USBR RISE", context: contextFor(NORMALS.parkerRelease, pCfs, m) };
  return { lake, upstream, inflow, outflow, cascade: mockCascade(lake, upstream, dCfs, pCfs), series: mockSeries(dCfs, pCfs), warnings: warningsFor(lake, inflow, outflow), notes: [] };
}

const MOCK = {
  "normal": () => mockScenario(mockLake(451.5, "full"), moh(643.1), 12500, "steady", 9200, "steady"),
  "low-lake": () => mockScenario(mockLake(444.2, "low"), moh(638.4), 8000, "falling", 7200, "falling"),
  "high-release": () => mockScenario(mockLake(451.0, "full"), moh(644.0), 19500, "rising", 16000, "rising"),
};
