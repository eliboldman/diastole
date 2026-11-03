// Run with: node lib/workouts/adjust.test.ts
import assert from "node:assert/strict";

import { adjustmentNotes, adjustSteps } from "./adjust.ts";
import type { Step } from "./garmin-format.ts";

const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "pace_range", slowSecPerKm: 360, fastSecPerKm: 340 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 180 }, target: { type: "pace_range", slowSecPerKm: 250, fastSecPerKm: 240 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 1000 }, target: { type: "power_range", low: 200, high: 240 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

const interval = (s: Step[]) => (s[1] as Extract<Step, { kind: "repeat" }>).steps[0] as Extract<Step, { kind: "step" }>;
const active = (s: Step[]) => s[2] as Extract<Step, { kind: "step" }>;

// Harder 5% intensity: pace faster, power up, durations untouched, warm-up untouched.
const h5 = adjustSteps(steps, { direction: "harder", percent: 5, scope: "intensity" });
assert.deepEqual(interval(h5).target, { type: "pace_range", slowSecPerKm: 238, fastSecPerKm: 229 });
assert.deepEqual(interval(h5).duration, { type: "time", seconds: 180 });
assert.deepEqual(active(h5).target, { type: "power_range", low: 210, high: 252 });
assert.deepEqual(h5[0], steps[0]);
assert.deepEqual((h5[1] as Extract<Step, { kind: "repeat" }>).steps[1], (steps[1] as Extract<Step, { kind: "repeat" }>).steps[1]);

// Easier 10% duration: work steps shorter (rounded), targets untouched.
const e10 = adjustSteps(steps, { direction: "easier", percent: 10, scope: "duration" });
assert.deepEqual(interval(e10).duration, { type: "time", seconds: 160 }); // 162 -> nearest 5
assert.deepEqual(active(e10).duration, { type: "distance", meters: 900 });
assert.deepEqual(interval(e10).target, interval(steps).target);

// Both
const hb = adjustSteps(steps, { direction: "harder", percent: 10, scope: "both" });
assert.deepEqual(interval(hb).duration, { type: "time", seconds: 200 });
assert.equal((interval(hb).target as { fastSecPerKm: number }).fastSecPerKm, 218);

// Input is not mutated.
assert.deepEqual(interval(steps).target, { type: "pace_range", slowSecPerKm: 250, fastSecPerKm: 240 });

// Notes
assert.equal(adjustmentNotes([{ kind: "step", intensity: "WARMUP", duration: { type: "open" } }], { direction: "harder", percent: 5, scope: "both" }).length > 0, true);

console.log("adjust: all tests passed");
