/**
 * Havasu Lake Weather — air quality (HLW-047).
 *
 * Open-Meteo Air Quality (CAMS) — free + keyless. Current US AQI, the dominant
 * pollutant, and the next-24h peak, for the home-page tile. Modeled at the lake's
 * coordinates (not an EPA monitor) — labeled as such. Attribution: CAMS + Open-Meteo.
 */

const HAVASU = { lat: 34.4822, lon: -114.4138 };
const BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

// US AQI category by index value: [maxInclusive, name, slug].
const CATS = [
  [50, "Good", "good"],
  [100, "Moderate", "moderate"],
  [150, "Unhealthy for Sensitive Groups", "usg"],
  [200, "Unhealthy", "unhealthy"],
  [300, "Very Unhealthy", "veryunhealthy"],
  [Infinity, "Hazardous", "hazardous"],
];
export function aqiCategory(aqi) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  for (const [hi, name, slug] of CATS) if (aqi <= hi) return { name, slug };
  return { name: "Hazardous", slug: "hazardous" };
}

// Friendly labels for the per-pollutant US AQI sub-index fields.
const POLL = {
  us_aqi_pm2_5: "PM2.5", us_aqi_pm10: "PM10", us_aqi_ozone: "Ozone",
  us_aqi_nitrogen_dioxide: "NO₂", us_aqi_sulphur_dioxide: "SO₂", us_aqi_carbon_monoxide: "CO",
};
// Dominant pollutant = the sub-index that's highest (it drives the overall AQI).
export function dominant(cur) {
  let best = null, bestv = -1;
  for (const k of Object.keys(POLL)) {
    const v = cur?.[k];
    if (typeof v === "number" && v > bestv) { bestv = v; best = k; }
  }
  return best ? POLL[best] : null;
}

// Highest US AQI in the next 24h from the hourly series (unixtime seconds).
export function peakNext24(times, values, nowMs = Date.now()) {
  if (!Array.isArray(times) || !Array.isArray(values)) return null;
  const nowS = Math.floor(nowMs / 1000), end = nowS + 24 * 3600;
  let peak = null;
  for (let i = 0; i < times.length; i++) {
    const t = times[i], v = values[i];
    if (typeof t !== "number" || typeof v !== "number") continue;
    if (t < nowS || t > end) continue;
    if (!peak || v > peak.aqi) peak = { aqi: Math.round(v), at: t };
  }
  return peak;
}

export async function getAir(nowMs = Date.now()) {
  const params = new URLSearchParams({
    latitude: String(HAVASU.lat), longitude: String(HAVASU.lon),
    current: "us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,pm2_5,pm10,ozone,dust",
    hourly: "us_aqi",
    timeformat: "unixtime",
    forecast_days: "2",
  });
  const r = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`open-meteo air ${r.status}`);
  const j = await r.json();
  const cur = j.current || {};
  const aqi = Number.isFinite(cur.us_aqi) ? Math.round(cur.us_aqi) : null;
  const cat = aqiCategory(aqi);
  const peak = peakNext24(j.hourly?.time, j.hourly?.us_aqi, nowMs);
  return {
    source: "Open-Meteo (CAMS)",
    observedAt: cur.time ?? null, // unix seconds
    aqi,
    category: cat?.name ?? null,
    categorySlug: cat?.slug ?? null,
    dominant: dominant(cur),
    // Current concentrations (µg/m³) for the breakdown row.
    pollutants: {
      pm25: Number.isFinite(cur.pm2_5) ? +cur.pm2_5.toFixed(1) : null,
      pm10: Number.isFinite(cur.pm10) ? Math.round(cur.pm10) : null,
      ozone: Number.isFinite(cur.ozone) ? Math.round(cur.ozone) : null,
      dust: Number.isFinite(cur.dust) ? Math.round(cur.dust) : null,
    },
    peak: peak ? { aqi: peak.aqi, at: peak.at, category: aqiCategory(peak.aqi)?.name ?? null } : null,
  };
}
