// Run with: node lib/activity/compare.test.ts
import assert from "node:assert/strict";

import type { Step } from "../workouts/garmin-format.ts";
import { alignLaps, compareWorkout, expandSteps, judge } from "./compare.ts";
import type { Lap } from "./fit.ts";
import { estimateMaxHr, hrZones, paceZones, timeInZones, zoneOf } from "./zones.ts";

// ---------------------------------------------------------------- zones
const hr = hrZones(200);
assert.deepEqual(hr.map((z) => [z.low, z.high]), [[null, 120], [120, 140], [140, 160], [160, 180], [180, null]]);
assert.equal(zoneOf(hr, 100).n, 1, "below zone 1 counts as zone 1");
assert.equal(zoneOf(hr, 159).n, 3);
assert.equal(zoneOf(hr, 199).n, 5);
assert.deepEqual(timeInZones(hr, [130, 130, null, 170, 0, 190], 5), [0, 10, 0, 5, 5], "nulls and zeros skipped");
assert.equal(paceZones(4)[4].low, 4.08, "speed zone 5 starts just above threshold");
assert.equal(estimateMaxHr([180, 185]), null, "too few sessions");
assert.equal(estimateMaxHr([180, 250, 185, 170]), 184, "ignores impossible readings, uses second-highest +2%");

// ---------------------------------------------------------------- steps
const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
  {
    kind: "repeat",
    times: 3,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 1000 }, target: { type: "pace_range", slowSecPerKm: 250, fastSecPerKm: 240 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 2 } },
];
const planned = expandSteps(steps);
assert.equal(planned.length, 8);
assert.equal(planned[1].rep, "1 of 3");
assert.equal(planned[6].rep, "3 of 3");

const lap = (o: Partial<Lap>): Lap => ({
  start_s: 0, duration_s: 60, distance_m: null, avg_hr: null, max_hr: null, avg_speed: null, max_speed: null,
  avg_power: null, avg_cadence: null, ascent_m: null, intensity: null, step_index: null, ...o,
});

// One lap per step
const laps = [
  lap({ duration_s: 600 }),
  lap({ duration_s: 245, avg_speed: 1000 / 245 }), // on target
  lap({ duration_s: 120 }),
  lap({ duration_s: 225, avg_speed: 1000 / 225 }), // too fast
  lap({ duration_s: 120 }),
  lap({ duration_s: 270, avg_speed: 1000 / 270 }), // too slow
  lap({ duration_s: 120 }),
  lap({ duration_s: 600, avg_hr: 150 }), // zone 2 is 120-140 at max 200: over
];
const res = compareWorkout(steps, laps, 200)!;
assert.deepEqual(res.map((r) => r.verdict), [null, "on", null, "over", null, "under", null, "over"]);
assert.equal(compareWorkout(steps, laps, null)![7].verdict, null, "no max HR: zone targets can't be judged");

// Auto-lap split one step into two laps: merged by workout step index
const split = laps.map((l, i) => ({ ...l, step_index: i }));
split.splice(0, 1, { ...split[0], duration_s: 300, step_index: 0 }, { ...split[0], duration_s: 300, step_index: 0 });
const merged = alignLaps(planned, split)!;
assert.equal(merged.length, 8);
assert.equal(merged[0].duration_s, 600);

// Laps that don't line up: no comparison rather than a wrong one
assert.equal(alignLaps(planned, laps.slice(0, 5)), null);

assert.equal(judge(102, [90, 100]), "on", "within 3% slack");
assert.equal(judge(104, [90, 100]), "over");
assert.equal(judge(null, [90, 100]), null);

console.log("compare: all passed");
