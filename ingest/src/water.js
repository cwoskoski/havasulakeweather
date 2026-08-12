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

const UA = process.env.NWS_USER_AGENT || "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";
const HAVASU_DATUM = 402.85; // ft, gage-height → NAVD88 water-surface elevation for 09427500
const HAVASU_FULL = 450;     // ~full pool (Reclamation datum); used only for a coarse status

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

// USBR RISE release (cfs). Item id pinned via env at go-live; null until then.
async function riseRelease(itemId, name, timeoutMs = 4500) {
  if (!itemId) return null;
  const url = `https://data.usbr.gov/rise/api/result?itemId=${itemId}&order[dateTime]=desc&itemsPerPage=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`RISE ${itemId} -> ${r.status}`);
    const j = await r.json();
    const rec = (j.data || [])[0];
    const a = rec && rec.attributes ? rec.attributes : null;
    if (!a) return null;
    return { name, cfs: Math.round(parseFloat(a.result)), trend: "steady", observedAt: a.dateTime, source: "USBR RISE" };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function lakeStatus(elev) {
  if (elev == null) return "unknown";
  if (elev >= 449) return "full";
  if (elev >= 444) return "normal";
  return "low";
}

async function getLive() {
  // USGS waterservices is slow from Lambda (well over NWS latency), so give it
  // room and let each gauge fail independently rather than aborting the pair.
  const settle = async (p) => { try { return await p; } catch { return null; } };
  const [hav, moh] = await Promise.all([
    settle(usgsLatest("iv", "09427500", "00065", 8000)),  // Lake Havasu gage height
    settle(usgsLatest("dv", "09422500", "62614", 8000)),  // Lake Mohave elevation (NGVD29)
  ]);
  const elev = hav ? +(hav.value + HAVASU_DATUM).toFixed(2) : null;
  const lake = hav ? {
    name: "Lake Havasu", elevationFt: elev, gageFt: hav.value, fullPoolFt: HAVASU_FULL,
    status: lakeStatus(elev), observedAt: hav.at, datum: "NAVD88",
  } : null;
  const upstream = moh ? {
    name: "Lake Mohave", elevationFt: +moh.value.toFixed(2), observedAt: moh.at, datum: "NGVD29",
  } : null;
  const [inflow, outflow] = await Promise.all([
    riseRelease(process.env.RISE_DAVIS_ID, "Davis Dam release"),
    riseRelease(process.env.RISE_PARKER_ID, "Parker Dam release"),
  ]);
  const notes = [];
  if (lake && lake.status === "low") notes.push("Lake Havasu is running below its normal band.");
  if (!inflow && !outflow) notes.push("Dam release rates (USBR) coming soon.");
  return { source: "live", lake, upstream, inflow, outflow, notes };
}

export async function getWater(mock) {
  const updatedAt = now();
  if (mock) {
    const make = MOCK[mock] || MOCK.normal;
    return { updatedAt, location: "Lake Havasu", source: "mock", mock, ...make() };
  }
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
  return { name: "Lake Havasu", elevationFt: elev, gageFt: +(elev - HAVASU_DATUM).toFixed(2), fullPoolFt: HAVASU_FULL, status, observedAt: now(), datum: "NAVD88" };
}
const moh = (elev) => ({ name: "Lake Mohave", elevationFt: elev, observedAt: now(), datum: "NGVD29" });
const rel = (name, cfs, trend) => ({ name, cfs, trend, observedAt: now(), source: "USBR RISE" });

const MOCK = {
  "normal": () => ({
    lake: mockLake(451.5, "full"), upstream: moh(643.1),
    inflow: rel("Davis Dam release", 12500, "steady"),
    outflow: rel("Parker Dam release", 9200, "steady"),
    notes: [],
  }),
  "low-lake": () => ({
    lake: mockLake(444.2, "low"), upstream: moh(638.4),
    inflow: rel("Davis Dam release", 8000, "falling"),
    outflow: rel("Parker Dam release", 7200, "falling"),
    notes: ["Lake Havasu is running low for the season."],
  }),
  "high-release": () => ({
    lake: mockLake(451.0, "full"), upstream: moh(644.0),
    inflow: rel("Davis Dam release", 19500, "rising"),
    outflow: rel("Parker Dam release", 16000, "rising"),
    notes: ["Heavy Davis Dam releases — stronger current downstream; use caution on the water."],
  }),
};
