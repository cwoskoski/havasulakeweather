// Unit tests for the research rollup + range helpers in ingest/src/research.js (HLW-052). No AWS/network.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  num, newAgg, addReading, mergeAgg, compactAgg, outAgg, meanDirOf, rainStep, bucketize, rollupHours,
  localDay, localDayStart, addDays, parseRange, pickResolution, alignStart, assemble, entriesFromReadings,
  hourPk, dayPk, monthsBetween, mockResearch, waterRow,
} from "../src/research.js";
import { dayFromHours } from "../src/rollup.js";

const T0 = Date.UTC(2026, 9, 10, 19, 0, 0); // noon PDT, Oct 10
const iso = (ms) => new Date(ms).toISOString().slice(0, 19) + "Z";
const rd = (min, o = {}) => ({ sk: iso(T0 + min * 60000), tempf: 90, temp1f: "85", humidity: 20, windspeedmph: 5, windgustmph: 8, winddir: 270, baromrelin: 29.9, uv: 6, solarradiation: 800, dailyrainin: 0, ...o });

test("num coerces stored strings and rejects blanks", () => {
  assert.equal(num("85.3"), 85.3);
  assert.equal(num(null), null);
  assert.equal(num(""), null);
  assert.equal(num("x"), null);
});

test("addReading tracks n/sum/min/max with the time each extreme happened", () => {
  const a = newAgg();
  addReading(a, rd(0, { temp1f: "80" }));
  addReading(a, rd(1, { temp1f: "88" }));
  addReading(a, rd(2, { temp1f: "84" }));
  assert.equal(a.n, 3);
  assert.deepEqual(a.shade, { n: 3, sum: 252, min: 80, minAt: rd(0).sk, max: 88, maxAt: rd(1).sk });
  assert.equal(outAgg(a).shade.avg, 84);
});

test("missing sensors are skipped, not counted as zero", () => {
  const a = addReading(newAgg(), rd(0, { temp1f: undefined, uv: null }));
  assert.equal(a.shade, undefined);
  assert.equal(a.uv, undefined);
  assert.equal(outAgg(a).shade, undefined);
});

test("mergeAgg combines exactly (avg of merged = avg of all readings)", () => {
  const a = newAgg(), b = newAgg(), all = newAgg();
  [70, 72, 74].forEach((t, i) => { addReading(a, rd(i, { tempf: t })); addReading(all, rd(i, { tempf: t })); });
  [90, 100].forEach((t, i) => { addReading(b, rd(10 + i, { tempf: t })); addReading(all, rd(10 + i, { tempf: t })); });
  const m = mergeAgg(mergeAgg(newAgg(), a), b);
  assert.deepEqual(outAgg(m, true).temp, outAgg(all, true).temp);
  assert.equal(m.n, 5);
});

test("mergeAgg ties keep the earliest time", () => {
  const a = addReading(newAgg(), rd(30, { tempf: 99 })), b = addReading(newAgg(), rd(5, { tempf: 99 }));
  assert.equal(mergeAgg(mergeAgg(newAgg(), a), b).temp.maxAt, rd(5).sk);
});

test("mergeAgg ignores empty/absent aggs and survives a round-trip through compactAgg", () => {
  const a = addReading(newAgg(), rd(0));
  const m = mergeAgg(mergeAgg(mergeAgg(newAgg(), null), { n: 0 }), compactAgg(a));
  assert.deepEqual(outAgg(m), outAgg(a));
});

test("meanDirOf averages across north and returns null when calm", () => {
  const a = newAgg();
  addReading(a, rd(0, { winddir: 350 }));
  addReading(a, rd(1, { winddir: 10 }));
  assert.equal(meanDirOf(a), 0);
  assert.equal(meanDirOf(addReading(newAgg(), rd(0, { windspeedmph: 0.5 }))), null);
});

test("rainStep sums increments and treats a counter drop as a midnight reset", () => {
  assert.equal(rainStep({ dailyrainin: 0.1 }, { dailyrainin: 0.13 }).toFixed(2), "0.03");
  assert.equal(rainStep({ dailyrainin: 0.5 }, { dailyrainin: 0.02 }), 0.02); // reset, then 0.02 fell
  assert.equal(rainStep({ dailyrainin: 0 }, { dailyrainin: 3 }), 0);         // glitch, not rain
  assert.equal(rainStep(null, { dailyrainin: 0.2 }), 0);
});

test("bucketize: rain lands in the bucket of the later reading; a dropout stays a null gap", () => {
  const rs = [rd(-1, { dailyrainin: 0.1 }), rd(0, { dailyrainin: 0.12 }), rd(5, { dailyrainin: 0.15 }), rd(25, { dailyrainin: 0.2 })];
  const b = bucketize(rs, T0, 10 * 60000, 3);
  assert.equal(b[0].n, 2);                    // the seed reading before start is not counted
  assert.equal(outAgg(b[0]).rainIn, 0.05);    // 0.02 + 0.03
  assert.equal(b[1], null);
  assert.equal(outAgg(b[2]).rainIn, 0.05);
});

test("rollupHours writes only hours with readings, keyed by hour start", () => {
  const rs = [rd(0), rd(30), rd(130)];
  const h = rollupHours(rs, T0, T0 + 3 * 3600e3);
  assert.deepEqual(h.map((x) => x.sk), [iso(T0), iso(T0 + 2 * 3600e3)]);
  assert.equal(h[0].n, 2);
});

test("local calendar: Pacific midnight across both DST changes", () => {
  assert.equal(localDay(Date.UTC(2026, 9, 11, 6, 59)), "2026-10-10"); // 11:59 PM PDT
  assert.equal(localDay(Date.UTC(2026, 9, 11, 7, 0)), "2026-10-11");
  assert.equal(localDayStart("2026-07-04"), Date.UTC(2026, 6, 4, 7));  // PDT
  assert.equal(localDayStart("2026-12-25"), Date.UTC(2026, 11, 25, 8)); // PST
  // DST ends Nov 1 2026: that day is 25 hours long
  assert.equal(localDayStart("2026-11-02") - localDayStart("2026-11-01"), 25 * 3600e3);
  assert.equal(localDayStart("2026-03-09") - localDayStart("2026-03-08"), 23 * 3600e3);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("parseRange: local-day dates, ISO, defaults, clipping, garbage", () => {
  const now = Date.UTC(2026, 9, 17, 21, 0);
  assert.deepEqual(parseRange({}, now), { startMs: now - 86400e3, endMs: now });
  const r = parseRange({ from: "2026-10-01", to: "2026-10-07" }, now);
  assert.equal(r.startMs, localDayStart("2026-10-01"));
  assert.equal(r.endMs, localDayStart("2026-10-08")); // `to` is inclusive
  assert.equal(parseRange({ from: "2026-10-15", to: "2026-12-01" }, now).endMs, now); // future clipped
  assert.equal(parseRange({ from: "2026-10-01T00:00:00Z" }, now).startMs, Date.UTC(2026, 9, 1));
  assert.equal(parseRange({ from: "nope" }, now), null);
  assert.equal(parseRange({ from: "2026-10-10", to: "2026-10-01" }, now), null);
  const huge = parseRange({ from: "2000-01-01" }, now);
  assert.equal(huge.endMs - huge.startMs, 366 * 5 * 86400e3);
});

test("pickResolution keeps every span to a few hundred points", () => {
  assert.deepEqual(pickResolution(24 * 3600e3), { src: "raw", stepMin: 10 });
  assert.deepEqual(pickResolution(72 * 3600e3), { src: "raw", stepMin: 30 });
  assert.deepEqual(pickResolution(7 * 86400e3), { src: "hour", stepMin: 60 });
  assert.deepEqual(pickResolution(14 * 86400e3), { src: "hour", stepMin: 180 });
  assert.deepEqual(pickResolution(31 * 86400e3), { src: "hour", stepMin: 360 });
  assert.deepEqual(pickResolution(365 * 86400e3), { src: "day", stepMin: 1440 });
});

test("alignStart counts buckets from local midnight", () => {
  const mid = localDayStart("2026-10-10");
  assert.equal(alignStart(mid + 7.5 * 3600e3, 360), mid + 6 * 3600e3); // 7:30 AM → 6 AM bucket
  assert.equal(alignStart(mid + 23 * 60000, 10), mid + 20 * 60000);
});

test("assemble: points, local-day rows and a summary that agree with each other", () => {
  const start = localDayStart("2026-10-10"), end = localDayStart("2026-10-12");
  const rs = [];
  for (let m = 0; m < 48 * 60; m += 15) rs.push({ ...rd(0), sk: iso(start + m * 60000), tempf: 70 + (m % 1440) / 60, dailyrainin: m >= 1440 + 600 ? 0.1 : 0 });
  const res = pickResolution(end - start);
  const out = assemble(entriesFromReadings(rs, start, end, res.stepMin), { startMs: start, endMs: end, res });
  assert.equal(out.points.length, 96);
  assert.deepEqual(out.days.map((d) => d.day), ["2026-10-10", "2026-10-11"]);
  assert.equal(out.days[0].temp.max, 93.8); // 93.75 rounded to 1 dp
  assert.equal(out.days[0].temp.maxAt, iso(start + 1425 * 60000)); // 11:45 PM local
  assert.equal(out.days[1].rainIn, 0.1);
  assert.equal(out.summary.rainIn, 0.1);
  assert.equal(out.summary.rainDays, 1);
  assert.equal(out.summary.days, 2);
  assert.equal(out.summary.n, rs.length);
  assert.ok(out.days[0].humidity.minAt === undefined); // day rows only time the headline metrics
  assert.ok(out.summary.humidity.minAt);
});

test("assemble at daily resolution: day rows for every day (gaps included), no points", () => {
  const start = localDayStart("2026-01-01"), end = localDayStart("2026-04-01");
  const a = addReading(newAgg(), rd(0));
  const entries = [{ t: localDayStart("2026-01-05"), a }, { t: localDayStart("2026-03-31"), a }];
  const out = assemble(entries, { startMs: start, endMs: end, res: pickResolution(end - start) });
  assert.equal(out.points, null);
  assert.equal(out.days.length, 90);
  assert.equal(out.days.filter((d) => d.n).length, 2);
  assert.equal(out.summary.days, 2);
});

test("dayFromHours merges hour items and skips empty days", () => {
  const h = rollupHours([rd(0, { tempf: 80 }), rd(70, { tempf: 95 })], T0, T0 + 2 * 3600e3);
  const d = dayFromHours("2026-10-10", h);
  assert.equal(d.sk, "2026-10-10");
  assert.equal(d.hours, 2);
  assert.equal(outAgg(d).temp.max, 95);
  assert.equal(dayFromHours("2026-10-11", []), null);
});

test("partition keys and month walking", () => {
  assert.equal(hourPk("K", Date.UTC(2026, 9, 31, 23)), "HOUR#K#2026-10");
  assert.equal(dayPk("K", "2026-10-31"), "DAY#K#2026");
  assert.deepEqual(monthsBetween(Date.UTC(2026, 10, 20), Date.UTC(2027, 1, 2)), ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("waterRow passes every stored lake/river field through, coerced to numbers", () => {
  const r = waterRow({ sk: "2026-10-01", havasuElevFt: 448.2, davisCfs: "12000", meadElevFt: 1050, powellInflowCfs: "4742", canyonTempF: 54.1, junk: 1 });
  assert.equal(r.date, "2026-10-01");
  assert.equal(r.havasuElevFt, 448.2);
  assert.equal(r.davisCfs, 12000);
  assert.equal(r.meadElevFt, 1050);
  assert.equal(r.powellInflowCfs, 4742);
  assert.equal(r.canyonTempF, 54.1);
  assert.equal(r.mohaveTempF, null);
  assert.equal("junk" in r, false);
});

test("waterRow derives % full per lake from storage (null when storage is missing)", () => {
  const r = waterRow({ sk: "2026-10-01", havasuStorageAf: 619000, mohaveStorageAf: 905000, meadStorageAf: 6530000, powellStorageAf: null });
  assert.equal(r.havasuPctFull, 100);
  assert.equal(r.mohavePctFull, 50);
  assert.equal(r.meadPctFull, 25);
  assert.equal(r.powellPctFull, null);
});

test("mockResearch runs the real pipeline at every resolution", () => {
  const now = Date.UTC(2026, 9, 17, 21, 0);
  for (const [qs, src] of [[{}, "raw"], [{ from: "2026-10-10" }, "hour"], [{ from: "2025-10-01" }, "day"]]) {
    const j = mockResearch("storm", parseRange(qs, now), now);
    assert.equal(j.source, "mock");
    assert.equal(j.res.src, src);
    assert.ok(j.days.length >= 1);
    assert.ok(j.summary.shade.max > j.summary.shade.min);
    assert.ok(j.water.length >= 1);
  }
});

test("outAgg: only the summary form carries per-metric counts", () => {
  const a = addReading(addReading(newAgg(), rd(0)), rd(1, { temp1f: null }));
  assert.equal(outAgg(a, true).shade.n, 1);
  assert.equal(outAgg(a, true).temp.n, 2);
  assert.equal(outAgg(a, ["shade"]).shade.n, undefined);
});
