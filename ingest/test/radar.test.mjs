// Unit tests for the pure HRRR helpers in ingest/src/radar.js. No network.
// iemInit (UTC init string), hrrrInit (previous top-of-hour), futureFrames (now→+6h @30m).
import { test } from "node:test";
import assert from "node:assert/strict";
import { iemInit, hrrrInit, futureFrames, parseWmsTimes, pickFrames, stormWarnings } from "../src/radar.js";

test("iemInit formats YYYYMMDDHHmm in UTC", () => {
  assert.equal(iemInit(new Date(Date.UTC(2026, 7, 27, 15, 0, 0))), "202608271500"); // Aug = month 7
  assert.equal(iemInit(new Date(Date.UTC(2026, 0, 3, 9, 5, 0))), "202601030905");
});

test("hrrrInit is the previous top-of-hour (UTC), reliably processed", () => {
  const init = hrrrInit(Date.UTC(2026, 7, 27, 16, 20, 0));
  assert.equal(iemInit(init), "202608271500");
  // on the hour boundary it still steps back one hour
  assert.equal(iemInit(hrrrInit(Date.UTC(2026, 7, 27, 16, 0, 0))), "202608271500");
});

test("futureFrames: 30-min steps from now→+6h, 4-digit fmin, ascending", () => {
  const now = Date.UTC(2026, 7, 27, 16, 20, 0);
  const init = hrrrInit(now); // 15:00Z
  const frames = futureFrames(now, init);
  assert.equal(frames.length, 12);              // 16:30 … 22:00 inclusive
  assert.equal(frames[0].fmin, "0090");          // 16:30 − 15:00 = 90 min
  assert.equal(frames[0].kind, "fc");
  assert.equal(frames[frames.length - 1].fmin, "0420"); // 22:00 − 15:00 = 420 min
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].time > frames[i - 1].time, "times strictly increasing");
    assert.ok(Number(frames[i].fmin) <= 1080, "within HRRR forecast range");
    assert.equal(frames[i].fmin.length, 4, "4-digit forecast minutes");
  }
});

test("futureFrames: honors hoursAhead + stepMin", () => {
  const now = Date.UTC(2026, 7, 27, 16, 0, 0);
  const init = hrrrInit(now); // 15:00Z
  const frames = futureFrames(now, init, { hoursAhead: 2, stepMin: 60 });
  // 17:00 and 18:00 (16:00 itself is not > now-rounded start; ceil(16:00)→16:00, so 16:00,17:00,18:00)
  assert.deepEqual(frames.map((f) => f.fmin), ["0060", "0120", "0180"]);
});

// ---- HLW-054: NOAA MRMS observed frames + NWS warning polygons ----

const CAP = `<WMS_Capabilities><Capability><Layer><Name>other</Name><Dimension name="time">2020-01-01T00:00:00Z</Dimension></Layer>
<Layer queryable="1"><Name>conus_bref_qcd</Name><Dimension name="time" default="2026-10-17T23:00:13Z" units="ISO8601">2026-10-17T22:56:12.000Z,2026-10-17T22:57:58.000Z, 2026-10-17T23:00:13.000Z</Dimension></Layer></Capability></WMS_Capabilities>`;

test("parseWmsTimes reads the named layer's time list, ascending, in ms", () => {
  const t = parseWmsTimes(CAP, "conus_bref_qcd");
  assert.equal(t.length, 3);
  assert.equal(new Date(t[2]).toISOString(), "2026-10-17T23:00:13.000Z");
  assert.deepEqual(parseWmsTimes(CAP, "missing"), []);
  assert.deepEqual(parseWmsTimes("<x/>", "conus_bref_qcd"), []);
});

test("pickFrames: ~10-min spacing over 2 h, newest last, irregular scan times", () => {
  const end = Date.UTC(2026, 9, 17, 23, 0, 13), times = [];
  for (let t = end - 130 * 60000; t <= end; t += 2 * 60000 + 7000) times.push(t); // ~2-min scans
  times.push(end);
  const f = pickFrames(times.sort((a, b) => a - b));
  assert.equal(f.length, 13);
  assert.equal(f[f.length - 1].time, Math.round(end / 1000));
  for (let i = 1; i < f.length; i++) {
    const gap = f[i].time - f[i - 1].time;
    assert.ok(gap >= 8 * 60 && gap <= 12 * 60, `gap ${gap}s`);
  }
  assert.deepEqual(pickFrames([]), []);
});

test("pickFrames skips steps a scan gap can't fill (no duplicates)", () => {
  const end = Date.UTC(2026, 9, 17, 23, 0);
  const f = pickFrames([end - 60 * 60000, end]); // one scan an hour ago, one now
  assert.deepEqual(f.map((x) => x.time), [Math.round((end - 3600e3) / 1000), Math.round(end / 1000)]);
});

test("stormWarnings keeps polygon warnings near the lake only", () => {
  const poly = (x, y) => ({ type: "Polygon", coordinates: [[[x, y], [x + 0.3, y], [x + 0.3, y + 0.3], [x, y]]] });
  const feats = [
    { properties: { event: "Severe Thunderstorm Warning", headline: "SVR near Needles" }, geometry: poly(-114.6, 34.6) },
    { properties: { event: "Flash Flood Warning" }, geometry: { type: "MultiPolygon", coordinates: [[[[-113.9, 34.2], [-113.5, 34.2], [-113.5, 34.5], [-113.9, 34.2]]]] } },
    { properties: { event: "Severe Thunderstorm Warning" }, geometry: poly(-122.4, 37.7) }, // Bay Area — out of the box
    { properties: { event: "Heat Advisory" }, geometry: poly(-114.6, 34.6) },               // not a storm-based warning
    { properties: { event: "Tornado Warning" }, geometry: null },                          // zone-based, no polygon
  ];
  const w = stormWarnings(feats);
  assert.deepEqual(w.map((x) => x.event), ["Severe Thunderstorm Warning", "Flash Flood Warning"]);
  assert.equal(w[0].headline, "SVR near Needles");
  assert.equal(w[1].headline, "Flash Flood Warning");
});
