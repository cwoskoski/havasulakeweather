/**
 * Unit tests for the NWS forecast/alerts module (ingest/src/nws.js).
 *
 * Exercised entirely through the offline `?mock=<scenario>` paths — no network,
 * no reliance on the real NWS API, fully deterministic. Uses Node's built-in
 * test runner (node:test) + node:assert/strict, zero dependencies.
 *
 * Verified against nws.js:
 *   MOCK_FORECAST scenario keys: "rain", "clear"
 *   MOCK_ALERTS   scenario keys: "heat-warning", "heat-advisory", "flood",
 *                                "flood-watch", "multi", "clear", "none"
 *   forecast fields: { updatedAt, location, source, mock, office,
 *                      rainSoon, hourly, daily, days }
 *   rainSoon shape:  { likely, withinHours, at, maxProbNext12h }
 *   days[] entry:    { date, weekday, hiF, loF, precipProb,
 *                      shortForecast, glyph, isDaytime }
 *   alert entry:     { id, event, severity, urgency, certainty, headline,
 *                      description, instruction, onset, expires, senderName,
 *                      category, tone }
 */

import test from "node:test";
import assert from "node:assert/strict";

import { getForecast, getAlerts } from "../src/nws.js";

// Glyphs glyphFor() emits for wet conditions (thunderstorm / rain / snow).
const WET_GLYPHS = new Set(["⛈️", "🌧️", "🌨️"]);
const STORMY_RE = /thunder|storm|rain|shower/i;

/* --------------------------------------------------------------- forecast -- */

test("getForecast('rain') resolves to a mock forecast with a 7-day strip", async () => {
  const fc = await getForecast("rain");

  assert.equal(fc.source, "mock");
  assert.equal(fc.mock, "rain");
  assert.equal(typeof fc.location, "string");
  assert.ok(fc.location.length > 0, "location should be a non-empty label");

  assert.ok(Array.isArray(fc.days), "days should be an array");
  assert.ok(fc.days.length >= 1 && fc.days.length <= 7, "days is up to 7 entries");
});

test("getForecast('rain') days each carry numeric-or-null temps, a weekday and a glyph", async () => {
  const { days } = await getForecast("rain");

  for (const d of days) {
    assert.ok(d.hiF === null || typeof d.hiF === "number", "hiF is numeric or null");
    assert.ok(d.loF === null || typeof d.loF === "number", "loF is numeric or null");
    assert.ok(
      d.precipProb === null || typeof d.precipProb === "number",
      "precipProb is numeric or null",
    );

    assert.equal(typeof d.weekday, "string");
    assert.ok(d.weekday.length > 0, "weekday should be non-empty");

    assert.equal(typeof d.glyph, "string");
    assert.ok(d.glyph.length > 0, "glyph should be a non-empty emoji");

    assert.equal(typeof d.shortForecast, "string");
    assert.equal(typeof d.date, "string");
    assert.equal(typeof d.isDaytime, "boolean");
  }
});

test("getForecast('rain') has a stormy day whose glyph is one of the wet glyphs", async () => {
  const { days } = await getForecast("rain");

  const stormy = days.filter((d) => STORMY_RE.test(d.shortForecast));
  assert.ok(stormy.length >= 1, "at least one day should read as stormy/rainy");

  // The stormy day (mock: "Showers And Thunderstorms Likely") must render a wet glyph.
  assert.ok(
    stormy.some((d) => WET_GLYPHS.has(d.glyph)),
    `expected a wet glyph among stormy days, got: ${stormy.map((d) => d.glyph).join(" ")}`,
  );
});

test("getForecast('rain') flags rainSoon.likely true and reports the peak probability", async () => {
  const { rainSoon } = await getForecast("rain");

  // Mock hourly probs [10,20,40,60,70,...] cross the 30% threshold at index 2.
  assert.equal(rainSoon.likely, true, "wet scenario crosses the rain threshold");
  assert.equal(rainSoon.withinHours, 2, "first hour at/above threshold is index 2");
  assert.equal(rainSoon.at !== null, true, "an onset time is set when likely");
  assert.equal(typeof rainSoon.maxProbNext12h, "number");
  assert.equal(rainSoon.maxProbNext12h, 70, "peak of the mock hourly window");
});

test("getForecast('clear') days present, no wet glyphs and no stormy text", async () => {
  const { days } = await getForecast("clear");

  assert.ok(Array.isArray(days) && days.length >= 1, "days should be present");

  for (const d of days) {
    assert.ok(!WET_GLYPHS.has(d.glyph), `clear day should not use a wet glyph: ${d.glyph}`);
    assert.ok(!STORMY_RE.test(d.shortForecast), `clear day should not read stormy: ${d.shortForecast}`);
    assert.ok(d.glyph.length > 0, "glyph should still be a non-empty emoji");
  }

  // The plain "Sunny" days map to the sunny glyph per glyphFor().
  assert.ok(
    days.some((d) => d.glyph === "☀️"),
    "expected at least one sunny ☀️ glyph in the clear forecast",
  );
});

test("getForecast('clear') reports rainSoon.likely false below the threshold", async () => {
  const { rainSoon } = await getForecast("clear");

  // Mock hourly probs [0,0,1,2,1,...] never reach the 30% threshold.
  assert.equal(rainSoon.likely, false, "dry scenario stays below the rain threshold");
  assert.equal(rainSoon.at, null, "no onset time when not likely");
  assert.equal(rainSoon.withinHours, null, "no within-hours when not likely");
  assert.equal(rainSoon.maxProbNext12h, 2, "peak of the dry mock hourly window");
});

test("getForecast falls back to the clear scenario for an unknown mock key", async () => {
  const fc = await getForecast("does-not-exist");

  assert.equal(fc.source, "mock");
  // Unknown key resolves via MOCK_FORECAST.clear -> dry rainSoon.
  assert.equal(fc.rainSoon.likely, false);
  assert.ok(Array.isArray(fc.days) && fc.days.length >= 1);
});

/* ----------------------------------------------------------------- alerts -- */

test("getAlerts('clear') returns zero alerts", async () => {
  const res = await getAlerts("clear");

  assert.equal(res.source, "mock");
  assert.equal(res.mock, "clear");
  assert.equal(res.count, 0);
  assert.ok(Array.isArray(res.alerts), "alerts should be an array");
  assert.equal(res.alerts.length, 0, "clear scenario has no alerts");
});

test("getAlerts('heat-warning') returns a normalized heat alert", async () => {
  const res = await getAlerts("heat-warning");

  assert.equal(res.source, "mock");
  assert.ok(res.count >= 1, "heat-warning should surface at least one alert");
  assert.equal(res.alerts.length, res.count, "count matches alerts array length");

  const a = res.alerts[0];
  assert.equal(typeof a.id, "string");
  assert.ok(a.id.length > 0, "alert id should be non-empty");
  assert.equal(typeof a.event, "string");
  assert.ok(a.event.length > 0, "alert event should be non-empty");
  assert.equal(a.severity, "Severe");
  assert.equal(a.category, "heat", "categoryOf() should classify heat events");
  assert.equal(a.tone, "critical", "toneOf('Severe') should be critical");
  assert.equal(a.senderName, "NWS Las Vegas NV (MOCK)");
});

test("getAlerts('flood') returns a normalized flood alert", async () => {
  const res = await getAlerts("flood");

  assert.ok(res.count >= 1, "flood should surface at least one alert");
  const a = res.alerts[0];
  assert.equal(a.category, "flood", "categoryOf() should classify flood events");
  assert.equal(a.tone, "critical", "a Severe flood warning is critical toned");
  assert.ok(typeof a.headline === "string" && a.headline.length > 0, "headline present");
});

test("getAlerts('multi') returns multiple alerts sorted by severity", async () => {
  const res = await getAlerts("multi");

  assert.equal(res.count, 2, "multi bundles a flood + a heat advisory");
  assert.equal(res.alerts.length, 2);

  // sortAlerts ranks Severe(1) before Moderate(2): flood should lead, heat trails.
  assert.equal(res.alerts[0].category, "flood");
  assert.equal(res.alerts[0].severity, "Severe");
  assert.equal(res.alerts[1].category, "heat");
  assert.equal(res.alerts[1].severity, "Moderate");
});

test("getAlerts falls back to clear for an unknown mock key", async () => {
  const res = await getAlerts("nope-not-real");

  assert.equal(res.source, "mock");
  assert.equal(res.count, 0);
  assert.deepEqual(res.alerts, []);
});
