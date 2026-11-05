// Run: npm run test:swim
import assert from "node:assert/strict";

import type { Lap } from "./fit.ts";
import { shortDistance, speedText } from "./format.ts";
import { swimClock, swimPace, swimPool, swimSummary } from "./swim.ts";

const lap = (start_s: number, duration_s: number, distance_m: number | null, extra: Partial<Lap> = {}): Lap => ({
  start_s, duration_s, distance_m, avg_hr: 140, max_hr: 150, avg_speed: null, max_speed: null, avg_power: null,
  avg_cadence: 30, ascent_m: null, intensity: null, step_index: null, ...extra,
});

// Yard pool inferred from lap distances (no pool recorded), even for a km viewer.
const yd = [lap(0, 265.8, 274.3), lap(370, 2, null), lap(372, 57.4, 45.7), lap(500, 167.8, 182.9)];
assert.equal(swimPool(null, yd, null, "km").unit, "YARD");
assert.equal(swimPool(null, [lap(0, 100, 100), lap(120, 50, 50)], null, "mi").unit, "METER");
assert.equal(swimPool(null, [], null, "mi").unit, "YARD"); // open water: viewer's units
assert.deepEqual(swimPool({ interval_s: 5, t: [], pool: { unit: "METER", length_m: 25 } }, yd, null, "mi"), { unit: "METER", length_m: 25 });

const s = swimSummary(yd, "YARD", { unit: "YARD", length_m: 22.86 })!;
assert.equal(s.reps.length, 3);
assert.equal(swimClock(s.reps[0].sec_per_100), "1:29"); // 300 yd in 4:25.8
assert.equal(Math.round(s.reps[0].rest_s!), 106); // rest lap + paused time, start to start
assert.equal(Math.round(s.reps[1].rest_s!), 71);
assert.equal(s.reps[2].rest_s, null);
assert.equal(s.reps[0].lengths, 12);

// SWOLF from the watch's lengths and strokes: 100 m in 100 s, 4 lengths, 80 strokes -> 25 + 20.
const m = swimSummary([lap(0, 100, 100, { lengths: 4, strokes: 80 })], "METER", { unit: "METER", length_m: 25 })!;
assert.equal(m.reps[0].swolf, 45);
assert.equal(m.reps[0].strokes_per_length, 20);

assert.equal(swimSummary([lap(0, 30, null)], "YARD", { unit: "YARD", length_m: null }), null);
assert.equal(swimPace(1.032, "YARD"), "1:29 /100yd");
assert.equal(swimPace(0, "YARD"), null);
assert.equal(swimClock(59.96, true), "1:00.0");
assert.equal(speedText(1, "lap_swimming", "km"), "1:40 /100m");
assert.equal(speedText(1, "cycling", "mi"), "2.2 mph");
assert.equal(shortDistance(1371.6, "km", "lap_swimming"), "1,500 yd");
assert.equal(shortDistance(5000, "mi", "running"), "3.1 mi");

console.log("swim: all passed");
