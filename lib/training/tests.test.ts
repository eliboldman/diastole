// Run with: node lib/training/tests.test.ts
import assert from "node:assert/strict";

import { analyzeTest, detectTest, mergeWithTests, suggestFromTests, testSteps, TESTS } from "./tests.ts";

// --- Detection: the planned test wins; otherwise the activity name.
assert.equal(detectTest({ name: "Morning ride", sport: "cycling", planned_test: "ramp" }), "ramp");
assert.equal(detectTest({ name: "FTP Test", sport: "cycling" }), "ftp20");
assert.equal(detectTest({ name: "Ramp test", sport: "virtual_ride" }), "ramp");
assert.equal(detectTest({ name: "CSS test", sport: "lap_swimming" }), "css");
assert.equal(detectTest({ name: "Threshold run test", sport: "running" }), "run30");
assert.equal(detectTest({ name: "FTP Test", sport: "running" }), null, "an 'FTP test' run is never a bike test");
assert.equal(detectTest({ name: "Tempo ride", sport: "cycling" }), null);
assert.equal(detectTest({ name: "Branson Running", sport: "running" }), null);

// --- Steps: bike power from FTP when known; never heart rate on the bike.
const ftp = testSteps("ftp20", { ftp_w: 200 });
const flat = (s: ReturnType<typeof testSteps>): ReturnType<typeof testSteps> => s.flatMap((x) => (x.kind === "repeat" ? flat(x.steps) : [x]));
assert.ok(flat(ftp).every((s) => s.kind === "step" && (!s.target || s.target.type === "power_range")), "bike test: power targets only");
assert.equal(flat(ftp).find((s) => s.kind === "step" && s.intensity === "WARMUP")?.kind === "step" && (flat(ftp)[0] as { target?: { low: number } }).target?.low, 100);
assert.ok(flat(testSteps("ftp20")).every((s) => s.kind === "step" && !s.target), "no FTP yet: no targets rather than guesses");
assert.ok(flat(testSteps("ramp")).filter((s) => s.kind === "step" && s.intensity === "INTERVAL").length >= 15);
assert.equal(TESTS.css.sport, "swim");

// --- FTP from a 20-minute block: 10 min easy at 120 W, 20 min at 250 W, 10 min easy (1 s samples).
const watts = [...Array(600).fill(120), ...Array(1200).fill(250), ...Array(600).fill(110)];
const ride = { interval_s: 1, t: watts.map((_, i) => i), power: watts };
const r1 = analyzeTest("ftp20", { streams: ride });
assert.equal(r1?.key, "ftp_w");
assert.equal(r1?.value, 238, "95% of 250");
// Too short for a 20-minute test: nothing.
assert.equal(analyzeTest("ftp20", { streams: { interval_s: 1, t: [0, 1], power: [300, 300] } }), null);

// --- Ramp: best minute 340 W → FTP 255.
const ramp = [...Array(300).fill(100), ...Array(60).fill(300), ...Array(60).fill(340), ...Array(20).fill(200)];
assert.equal(analyzeTest("ramp", { streams: { interval_s: 1, t: ramp.map((_, i) => i), power: ramp } })?.value, 255);

// --- Run: 10 min easy at 3 m/s, 30 min test (first 10 at 4.0, last 20 at 4.2 m/s), 5 min easy.
const t: number[] = [];
const dist: number[] = [];
const hr: number[] = [];
let d = 0;
for (let i = 0; i <= 2700; i++) {
  const v = i < 600 ? 3 : i < 1200 ? 4.0 : i < 2400 ? 4.2 : 2.8;
  if (i > 0) d += v;
  t.push(i);
  dist.push(d);
  hr.push(i < 1200 ? 140 : i < 2400 ? 172 : 150);
}
const run = analyzeTest("run30", { streams: { interval_s: 1, t, dist, hr } });
assert.equal(run?.key, "threshold_speed_mps");
assert.ok(Math.abs(run!.value - 4.2) < 0.05, `last 20 min ≈ 4.2 m/s (got ${run?.value})`);
assert.ok(run!.thresholdHr! >= 170 && run!.thresholdHr! <= 173);

// --- CSS: 400 yd in 6:00, 200 yd in 2:50 (25 yd pool): 190 s over the 200 yd between them.
const lap = (distance_m: number, duration_s: number) => ({ start_s: 0, duration_s, distance_m, avg_hr: null, max_hr: null, avg_speed: null, max_speed: null, avg_power: null, avg_cadence: null, ascent_m: null, intensity: "active", step_index: null });
const yd = 0.9144;
const laps = [lap(300 * yd, 330), lap(400 * yd, 360), lap(100 * yd, 150), lap(200 * yd, 170), lap(200 * yd, 260)];
const css = analyzeTest("css", { laps, streams: { interval_s: 5, t: [0], pool: { unit: "YARD", length_m: 25 * yd } } });
assert.equal(css?.key, "css_sec_per_100m");
assert.ok(Math.abs(css!.value - (190 / (200 * yd)) * 100) < 0.2, `CSS per 100 m (got ${css?.value})`);
assert.ok(css!.why.includes("/100 yd"), "explained in the pool's unit");
// Meters pool, no pool info: still found.
const m = analyzeTest("css", { laps: [lap(400, 340), lap(200, 160)] });
assert.ok(m && Math.abs(m.value - 90) < 0.2, "CSS (340−160)/2 = 90 s/100 m");
// A 200 slower per metre than the 400 isn't a valid test.
assert.equal(analyzeTest("css", { laps: [lap(400, 300), lap(200, 200)] }), null);
assert.equal(analyzeTest("css", { laps: [] }), null);

// --- Suggestions from tests: newest per zone, down as well as up, settled ones skipped.
const done = (id: string, date: string, key: "ftp_w" | "css_sec_per_100m", value: number) => ({ activity_id: id, start_time: date, result: { kind: key === "ftp_w" ? ("ftp20" as const) : ("css" as const), key, value, why: "x" } });
const down = suggestFromTests({ ftp_w: 231 }, [done("old", "2026-10-01T10:00:00Z", "ftp_w", 240), done("new", "2026-11-04T10:00:00Z", "ftp_w", 195)]);
assert.equal(down.length, 1);
assert.equal(down[0].suggested, 195, "a test can lower FTP");
assert.equal(down[0].activity_id, "new", "newest test wins");
assert.equal(suggestFromTests({ ftp_w: 231, dismissed: { "test:new": 1 } }, [done("new", "2026-11-04T10:00:00Z", "ftp_w", 195)]).length, 0, "settled");
assert.equal(suggestFromTests({ ftp_w: 196 }, [done("new", "2026-11-04T10:00:00Z", "ftp_w", 195)]).length, 0, "within 2%");
assert.equal(suggestFromTests(null, [done("c", "2026-11-04T10:00:00Z", "css_sec_per_100m", 104)])[0].current, null, "fills a blank CSS");
// Merge: a test beats an older training effort; a newer effort beats the test.
const tr = (key: string, date: string) => ({ key, date, src: "training" });
const ts = (key: string, date: string) => ({ key, date, src: "test" });
assert.deepEqual(mergeWithTests([tr("ftp_w", "2026-11-01")], [ts("ftp_w", "2026-11-04")]).map((x) => x.src), ["test"]);
assert.deepEqual(mergeWithTests([tr("ftp_w", "2026-11-09")], [ts("ftp_w", "2026-11-04")]).map((x) => x.src), ["training"]);
assert.equal(mergeWithTests([tr("max_hr", "2026-11-01")], [ts("ftp_w", "2026-11-04")]).length, 2);

console.log("threshold tests: all passed");
