// Unit tests for the pure air-quality helpers in ingest/src/air.js (HLW-047). No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aqiCategory, dominant, peakNext24 } from "../src/air.js";

test("aqiCategory: US AQI breakpoints", () => {
  assert.equal(aqiCategory(0).slug, "good");
  assert.equal(aqiCategory(50).slug, "good");
  assert.equal(aqiCategory(51).slug, "moderate");
  assert.equal(aqiCategory(100).slug, "moderate");
  assert.equal(aqiCategory(101).slug, "usg");
  assert.equal(aqiCategory(150).name, "Unhealthy for Sensitive Groups");
  assert.equal(aqiCategory(175).slug, "unhealthy");
  assert.equal(aqiCategory(250).slug, "veryunhealthy");
  assert.equal(aqiCategory(400).slug, "hazardous");
});

test("aqiCategory: null / non-finite -> null", () => {
  assert.equal(aqiCategory(null), null);
  assert.equal(aqiCategory(undefined), null);
  assert.equal(aqiCategory(NaN), null);
});

test("dominant: friendly name of the highest sub-index", () => {
  assert.equal(dominant({ us_aqi_pm2_5: 55, us_aqi_pm10: 30, us_aqi_ozone: 37 }), "PM2.5");
  assert.equal(dominant({ us_aqi_pm2_5: 20, us_aqi_pm10: 22, us_aqi_ozone: 88 }), "Ozone");
  assert.equal(dominant({ us_aqi_pm2_5: 10, us_aqi_pm10: 61 }), "PM10");
  assert.equal(dominant({}), null);
  assert.equal(dominant({ us_aqi_pm2_5: null }), null);
});

test("peakNext24: max within the next 24h window (unixtime seconds)", () => {
  const nowMs = 1_700_000_000_000, nowS = 1_700_000_000;
  const times = [nowS - 3600, nowS + 3600, nowS + 7200, nowS + 90000]; // last is >24h out
  const values = [40, 60, 55, 200];
  const peak = peakNext24(times, values, nowMs);
  assert.equal(peak.aqi, 60);            // 200 is beyond 24h; 40 is in the past
  assert.equal(peak.at, nowS + 3600);
});

test("peakNext24: bad input -> null", () => {
  assert.equal(peakNext24(null, null, 1_700_000_000_000), null);
  assert.equal(peakNext24([], [], 1_700_000_000_000), null);
});
