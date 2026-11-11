// Run with: node lib/activity/compare.test.ts
import assert from "node:assert/strict";

import type { Step } from "../workouts/garmin-format.ts";
import { alignLaps, compareWorkout, compareWorkoutWith, expandSteps, judge } from "./compare.ts";
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

// Compliance and how far off a step was
{
  const { complianceOf, complianceText, missText } = await import("./compare.ts");
  const step = (verdict: "on" | "over" | "under" | null, measured: number | null, range: [number, number] | null, target: unknown) =>
    ({ planned: { label: "Interval", intensity: "INTERVAL", duration: { type: "time", seconds: 180 }, target }, actual: {}, verdict, measured, range }) as never;
  const pace = { type: "pace_range", fastSecPerKm: 240, slowSecPerKm: 250 };
  // 1000/250 = 4 m/s is the slow edge. 3.9 m/s → 256.4 s/km → 6 s/km slow.
  const slow = step("under", 3.9, [4, 1000 / 240], pace);
  assert.equal(missText(slow, "km"), "6 s/km slow");
  assert.equal(missText(step("over", 230, [180, 200], { type: "power_range", low: 180, high: 200 }), "mi"), "30 W high");
  assert.equal(missText(step("on", 190, [180, 200], { type: "power_range", low: 180, high: 200 }), "mi"), null);
  const k = complianceOf([slow, step("on", 4.1, [4, 4.17], pace), step(null, null, null, undefined)]);
  assert.deepEqual(k, { steps: 3, judged: 2, on: 1, over: 0, under: 1 });
  assert.equal(complianceText(k), "1 of 2 on target");
  assert.equal(complianceText(complianceOf([step(null, null, null, undefined)])), null);
  console.log("compliance: passed");
}

// Real-world lap shapes that used to give up
{
  const { sliceStreams } = await import("./compare.ts");
  const ride: Step[] = [
    { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
    { kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2400 }, target: { type: "power_range", low: 150, high: 180 } },
    { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 } },
  ];
  const p3 = expandSteps(ride);
  // Extra lap after the workout ended (watch kept recording until save)
  const extra = [lap({ duration_s: 600 }), lap({ duration_s: 2400, avg_power: 165 }), lap({ duration_s: 600 }), lap({ duration_s: 8 })];
  assert.equal(alignLaps(p3, extra)?.length, 3, "trailing sliver dropped");
  assert.equal(compareWorkout(ride, extra, null)![1].verdict, "on");
  // Same, with step indexes and a null-index tail lap
  const idx = extra.map((l, i) => ({ ...l, step_index: i < 3 ? i : null }));
  idx[3] = { ...idx[3], duration_s: 200 };
  assert.equal(alignLaps(p3, idx)?.length, 3, "unindexed tail after the workout dropped");
  // Auto-laps every 5 minutes, no step indexes: placed by the plan's clock
  const auto = Array.from({ length: 12 }, (_, i) => lap({ duration_s: 300, avg_power: i >= 2 && i < 10 ? 170 : 110 }));
  const a = alignLaps(p3, auto)!;
  assert.deepEqual(a.map((x) => x.duration_s), [600, 2400, 600]);
  assert.equal(a[1].avg_power, 170);
  // A repeat with one inner step: the watch gives every rep the same step index
  const reps: Step[] = [{ kind: "repeat", times: 3, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 300 } }] }];
  const sameIdx = [0, 1, 2].map(() => lap({ duration_s: 300, step_index: 1 }));
  assert.equal(alignLaps(expandSteps(reps), sameIdx)?.length, 3);
  // Laps that genuinely don't fit still give no comparison
  assert.equal(alignLaps(p3, [lap({ duration_s: 1200 }), lap({ duration_s: 2400 })]), null);

  // One lap for the whole ride: cut the recording at the planned times
  const t = Array.from({ length: 720 }, (_, i) => i * 5); // 60 min at 5 s
  const power = t.map((s) => (s >= 600 && s < 3000 ? 168 : 100));
  const sliced = sliceStreams(p3, { interval_s: 5, t, power })!;
  assert.deepEqual(sliced.map((x) => x.duration_s), [600, 2400, 600]);
  assert.equal(sliced[1].avg_power, 168);
  const one = compareWorkoutWith(ride, [lap({ duration_s: 3600 })], null, null, { interval_s: 5, t, power })!;
  assert.equal(one.method, "time");
  assert.equal(one.steps[1].verdict, "on");
  // A pause doesn't shift the cuts: 2 min gap in the middle
  const tp = t.map((s) => (s >= 1800 ? s + 120 : s));
  assert.deepEqual(sliceStreams(p3, { interval_s: 5, t: tp, power })!.map((x) => x.duration_s), [600, 2400, 600]);
  // Too short a session to trust
  assert.equal(sliceStreams(p3, { interval_s: 5, t: t.slice(0, 300), power }), null);
  console.log("lap shapes: passed");
}
