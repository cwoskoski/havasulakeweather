/**
 * Havasu Lake Weather — National Weather Service (api.weather.gov) client.
 *
 * Free, no API key — NWS only asks for a descriptive User-Agent. We pull the
 * official 7-day + hourly forecast and active alerts for the station's grid,
 * normalize them to the small shapes the page needs, and derive a "rain soon"
 * hint from the hourly precip probabilities.
 *
 * A ?mock=<scenario> mode returns canned fixtures so the alerts/forecast UI can
 * be built and previewed even when nothing is actually active (which, for the
 * loud stuff like flash floods, is most of the time).
 *
 * Grid/point are fixed for Havasu Lake, CA — resolved once from /points:
 *   point 34.4822,-114.4138  →  office VEF, grid 138,20  (San Bernardino County)
 */

const BASE = "https://api.weather.gov";
const UA = process.env.NWS_USER_AGENT || "HavasuLakeWeather/1.0 (+https://havasulakeweather.com)";
const POINT = process.env.NWS_POINT || "34.4822,-114.4138";
const GRID = process.env.NWS_GRID || "VEF/138,20";
const LOCATION = process.env.LOCATION_LABEL || "Havasu Lake, CA";

const RAIN_PROB_THRESHOLD = 30; // % — at/above this in the next 12h ⇒ "rain likely soon"
const HOURLY_LOOKAHEAD = 12;

async function nwsFetch(pathAndQuery, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${BASE}${pathAndQuery}`, {
      headers: { "user-agent": UA, accept: "application/geo+json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`NWS ${pathAndQuery} -> ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* ----------------------------------------------------------------- alerts -- */

const SEV_RANK = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

// A coarse category so the page can style (and de-emphasize routine heat) itself.
function categoryOf(event = "") {
  const e = event.toLowerCase();
  if (/heat/.test(e)) return "heat";
  if (/flood/.test(e)) return "flood";
  if (/fire|red flag/.test(e)) return "fire";
  if (/wind|dust|gale/.test(e)) return "wind";
  if (/thunder|storm|tornado/.test(e)) return "thunderstorm";
  if (/freeze|frost|cold|wind chill/.test(e)) return "cold";
  return "other";
}
// Suggested display tone from NWS severity (the page may still down-rank heat).
function toneOf(severity = "Unknown") {
  if (severity === "Extreme" || severity === "Severe") return "critical";
  if (severity === "Moderate") return "warning";
  return "info";
}

function normalizeAlert(feature) {
  const p = feature.properties || feature;
  return {
    id: p.id,
    event: p.event,
    severity: p.severity || "Unknown",
    urgency: p.urgency || null,
    certainty: p.certainty || null,
    headline: p.headline || null,
    description: p.description || null,
    instruction: p.instruction || null,
    onset: p.onset || p.effective || null,
    expires: p.expires || p.ends || null,
    senderName: p.senderName || "NWS",
    category: categoryOf(p.event),
    tone: toneOf(p.severity),
  };
}

function sortAlerts(a, b) {
  return (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)
    || String(a.expires).localeCompare(String(b.expires));
}

export async function getAlerts(mock) {
  const updatedAt = new Date().toISOString();
  if (mock) {
    const make = MOCK_ALERTS[mock] || MOCK_ALERTS.clear;
    const alerts = make().sort(sortAlerts);
    return { updatedAt, location: LOCATION, source: "mock", mock, count: alerts.length, alerts };
  }
  const data = await nwsFetch(`/alerts/active?point=${encodeURIComponent(POINT)}`);
  const alerts = (data.features || []).map(normalizeAlert).sort(sortAlerts);
  return { updatedAt, location: LOCATION, source: "NWS", count: alerts.length, alerts };
}

/* --------------------------------------------------------------- forecast -- */

const pop = (period) => (period?.probabilityOfPrecipitation?.value ?? null);

function normDaily(periods = []) {
  return periods.slice(0, 12).map((p) => ({
    name: p.name,
    isDaytime: p.isDaytime,
    tempF: p.temperature,
    precipProb: pop(p),
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
    windSpeed: p.windSpeed,
    windDir: p.windDirection,
    icon: p.icon,
    startTime: p.startTime,
  }));
}

function normHourly(periods = []) {
  return periods.slice(0, HOURLY_LOOKAHEAD).map((p) => ({
    time: p.startTime,
    isDaytime: p.isDaytime,
    tempF: p.temperature,
    precipProb: pop(p),
    shortForecast: p.shortForecast,
    icon: p.icon,
  }));
}

// "Rain likely soon" — the first upcoming hour to cross the threshold, plus the
// peak probability over the window. Drives a subtle forecast chip on the page.
function rainSoonFrom(hourly = []) {
  let maxProb = 0, at = null, withinHours = null;
  hourly.forEach((h, i) => {
    const v = h.precipProb ?? 0;
    if (v > maxProb) maxProb = v;
    if (at == null && v >= RAIN_PROB_THRESHOLD) { at = h.time; withinHours = i; }
  });
  return { likely: at != null, withinHours, at, maxProbNext12h: maxProb };
}

export async function getForecast(mock) {
  const updatedAt = new Date().toISOString();
  if (mock) {
    const make = MOCK_FORECAST[mock] || MOCK_FORECAST.clear;
    return { updatedAt, location: LOCATION, source: "mock", mock, ...make() };
  }
  const [daily, hourly] = await Promise.all([
    nwsFetch(`/gridpoints/${GRID}/forecast`),
    nwsFetch(`/gridpoints/${GRID}/forecast/hourly`),
  ]);
  const hourlyN = normHourly(hourly?.properties?.periods);
  return {
    updatedAt,
    location: LOCATION,
    source: "NWS",
    office: GRID.split("/")[0],
    rainSoon: rainSoonFrom(hourlyN),
    hourly: hourlyN,
    daily: normDaily(daily?.properties?.periods),
  };
}

/* ------------------------------------------------------------ mock fixtures --
 * Exercised via ?mock=<scenario> on /api/alerts and /api/forecast.
 *   alerts:   heat-warning | heat-advisory | flood | flood-watch | multi | clear
 *   forecast: rain | clear
 * Everything below is fake but shaped exactly like the real normalized output.
 */

function mkAlert(o) {
  return normalizeAlert({ properties: {
    id: o.id || `mock-${(o.event || "").replace(/\s+/g, "-").toLowerCase()}`,
    event: o.event,
    severity: o.severity,
    urgency: o.urgency || "Expected",
    certainty: o.certainty || "Likely",
    headline: o.headline,
    description: o.description,
    instruction: o.instruction || null,
    onset: new Date().toISOString(),
    expires: new Date(Date.now() + (o.hours || 6) * 3600e3).toISOString(),
    senderName: "NWS Las Vegas NV (MOCK)",
  } });
}

const MOCK_ALERTS = {
  "heat-warning": () => [mkAlert({
    event: "Excessive Heat Warning", severity: "Severe",
    headline: "Excessive Heat Warning until 8 PM PDT — afternoon highs 112 to 118",
    description: "Dangerously hot conditions with afternoon highs of 112 to 118 expected. The combination of hot temperatures and prolonged exposure significantly increases the potential for heat-related illnesses.",
    instruction: "Drink plenty of fluids, stay in an air-conditioned room, stay out of the sun, and check on relatives and neighbors.",
    hours: 8,
  })],
  "heat-advisory": () => [mkAlert({
    event: "Heat Advisory", severity: "Moderate",
    headline: "Heat Advisory in effect — highs near 108",
    description: "Hot temperatures near 108 expected. Hot temperatures may cause heat illnesses with prolonged exposure or activity.",
    instruction: "Stay hydrated and shift strenuous outdoor activity to the early morning.",
    hours: 9,
  })],
  "flood": () => [mkAlert({
    event: "Flash Flood Warning", severity: "Severe", urgency: "Immediate", certainty: "Observed",
    headline: "Flash Flood Warning until 6:15 PM PDT",
    description: "Thunderstorms producing heavy rain across the area. Flash flooding of desert washes, normally dry creeks, and low water crossings is expected.",
    instruction: "Turn around, don't drown. Avoid washes, arroyos, and flooded roadways. Move to higher ground.",
    hours: 2,
  })],
  "flood-watch": () => [mkAlert({
    event: "Flood Watch", severity: "Moderate",
    headline: "Flood Watch through this evening",
    description: "Deep monsoon moisture may produce heavy downpours capable of flash flooding across San Bernardino County.",
    instruction: "Monitor later forecasts and be ready to move to higher ground.",
    hours: 10,
  })],
  "multi": () => [...MOCK_ALERTS.flood(), ...MOCK_ALERTS["heat-advisory"]()],
  "clear": () => [],
  "none": () => [],
};

function mockHourly(probs, baseTempF) {
  const now = Date.now();
  return probs.map((pp, i) => ({
    time: new Date(now + i * 3600e3).toISOString(),
    isDaytime: true,
    tempF: baseTempF - i,
    precipProb: pp,
    shortForecast: pp >= 50 ? "Showers And Thunderstorms Likely" : pp >= 30 ? "Chance Showers" : "Sunny",
    icon: null,
  }));
}

function mockDaily(wet) {
  return [
    { name: "This Afternoon", isDaytime: true, tempF: 105, precipProb: wet ? 60 : 5, shortForecast: wet ? "Showers Likely" : "Sunny", detailedForecast: "", windSpeed: "5 to 10 mph", windDir: "S", icon: null, startTime: null },
    { name: "Tonight", isDaytime: false, tempF: 79, precipProb: wet ? 30 : 0, shortForecast: wet ? "Chance Showers" : "Clear", detailedForecast: "", windSpeed: "5 mph", windDir: "SSW", icon: null, startTime: null },
    { name: "Tomorrow", isDaytime: true, tempF: 103, precipProb: wet ? 20 : 5, shortForecast: "Mostly Sunny", detailedForecast: "", windSpeed: "5 to 10 mph", windDir: "SW", icon: null, startTime: null },
    { name: "Tomorrow Night", isDaytime: false, tempF: 80, precipProb: 5, shortForecast: "Mostly Clear", detailedForecast: "", windSpeed: "5 mph", windDir: "W", icon: null, startTime: null },
  ];
}

const MOCK_FORECAST = {
  "rain": () => {
    const hourly = mockHourly([10, 20, 40, 60, 70, 50, 30, 20, 10, 10, 5, 5], 104);
    return { office: "VEF", rainSoon: rainSoonFrom(hourly), hourly, daily: mockDaily(true) };
  },
  "clear": () => {
    const hourly = mockHourly([0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0], 103);
    return { office: "VEF", rainSoon: rainSoonFrom(hourly), hourly, daily: mockDaily(false) };
  },
};
