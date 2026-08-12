/**
 * Havasu Lake Weather — station comparison (your station vs a nearby PWS).
 *
 * QA / sanity check: pull a nearby Weather Underground PWS and diff it against
 * our own latest reading to catch sensor drift (e.g. our temp reading high from
 * sun exposure) or an offline station.
 *
 * The live pull needs a free, PWS-contributor api.weather.com key in WU_API_KEY.
 * Until that's set, ?mock=<scenario> serves fixtures so the compare UI can be
 * built now. Scenarios: agree | drift | offline.
 */

const WU_KEY = process.env.WU_API_KEY || "";
const NEARBY = process.env.WU_NEARBY_STATION || "KCAHAVAS2";
const LOCATION = process.env.LOCATION_LABEL || "Havasu Lake, CA";

function station(id, label, o = {}) {
  return {
    id, label,
    tempF: o.tempF ?? null,
    windMph: o.windMph ?? null,
    humidity: o.humidity ?? null,
    pressureInHg: o.pressureInHg ?? null,
    rainTodayIn: o.rainTodayIn ?? null,
    observedAt: o.observedAt ?? null,
    stale: !!o.stale,
  };
}

function deltasOf(a, b) {
  const d = (x, y, p = 1) => (x == null || y == null ? null : +(x - y).toFixed(p));
  return {
    tempF: d(a.tempF, b.tempF),
    windMph: d(a.windMph, b.windMph),
    humidity: d(a.humidity, b.humidity),
    pressureInHg: d(a.pressureInHg, b.pressureInHg, 2),
  };
}

function notesFor(deltas, nearby) {
  const n = [];
  if (nearby?.stale) n.push("Nearby station looks stale — showing its last known values.");
  if (deltas.tempF != null && Math.abs(deltas.tempF) >= 5) {
    n.push(`Temperature differs ${deltas.tempF > 0 ? "+" : ""}${deltas.tempF}°F vs the nearby station — worth checking sensor siting / sun exposure.`);
  }
  return n;
}

async function wuCurrent(stationId) {
  const url = `https://api.weather.com/v2/pws/observations/current?stationId=${stationId}&format=json&units=e&apiKey=${WU_KEY}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4500);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`WU ${stationId} -> ${r.status}`);
    const j = await r.json();
    const o = (j.observations || [])[0];
    if (!o) return null;
    const im = o.imperial || {};
    return station(stationId, `Nearby (${stationId})`, {
      tempF: im.temp, windMph: im.windSpeed, humidity: o.humidity,
      pressureInHg: im.pressure, rainTodayIn: im.precipTotal, observedAt: o.obsTimeUtc,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string|undefined} mock  scenario name, or falsy for live
 * @param {object|null} mine       our current reading as a station() object
 */
export async function getCompare(mock, mine) {
  const updatedAt = new Date().toISOString();

  if (mock) {
    const make = MOCK[mock] || MOCK.agree;
    const { a, b } = make();
    const deltas = deltasOf(a, b);
    return { updatedAt, location: LOCATION, source: "mock", mock, stations: { mine: a, nearby: b }, deltas, notes: notesFor(deltas, b) };
  }

  // Live path — deferred until a real WU read key is configured.
  if (!WU_KEY) {
    return {
      updatedAt, location: LOCATION, source: "live", configured: false,
      error: "wu_api_key_missing",
      message: "Set WU_API_KEY (from wunderground.com/member/api-keys) to enable live comparison.",
      stations: { mine: mine || null, nearby: null }, deltas: {}, notes: [],
    };
  }

  const nearby = await wuCurrent(NEARBY);
  const deltas = mine && nearby ? deltasOf(mine, nearby) : {};
  return {
    updatedAt, location: LOCATION, source: "live", configured: true,
    stations: { mine: mine || null, nearby }, deltas, notes: nearby ? notesFor(deltas, nearby) : [],
  };
}

/* ------------------------------------------------------------ mock fixtures --
 * a = our station, b = the nearby PWS. Fake, shaped like the live output.
 */
const now = () => new Date().toISOString();
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const MOCK = {
  // both stations closely agree — the healthy case
  agree: () => ({
    a: station("mine", "Havasu Lake (mine)", { tempF: 104.2, windMph: 8, humidity: 16, pressureInHg: 29.85, rainTodayIn: 0.0, observedAt: now() }),
    b: station("KCAHAVAS2", "Nearby (KCAHAVAS2)", { tempF: 103.5, windMph: 7, humidity: 17, pressureInHg: 29.86, rainTodayIn: 0.0, observedAt: ago(3) }),
  }),
  // our station reads hot — classic sun-exposure / siting drift
  drift: () => ({
    a: station("mine", "Havasu Lake (mine)", { tempF: 111.0, windMph: 5, humidity: 12, pressureInHg: 29.84, rainTodayIn: 0.0, observedAt: now() }),
    b: station("KCAHAVAS2", "Nearby (KCAHAVAS2)", { tempF: 104.0, windMph: 8, humidity: 16, pressureInHg: 29.86, rainTodayIn: 0.0, observedAt: ago(4) }),
  }),
  // the nearby station has gone quiet
  offline: () => ({
    a: station("mine", "Havasu Lake (mine)", { tempF: 103.8, windMph: 9, humidity: 15, pressureInHg: 29.85, rainTodayIn: 0.0, observedAt: now() }),
    b: station("KCAHAVAS2", "Nearby (KCAHAVAS2)", { tempF: 99.1, windMph: 3, humidity: 20, pressureInHg: 29.83, rainTodayIn: 0.0, observedAt: ago(180), stale: true }),
  }),
};
