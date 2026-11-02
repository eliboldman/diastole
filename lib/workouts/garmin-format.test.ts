// Run with: node lib/workouts/garmin-format.test.ts
import assert from "node:assert/strict";

import { toGarminWorkout, type Step } from "./garmin-format.ts";

const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 2 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 800 }, target: { type: "pace_range", slowSecPerKm: 240, fastSecPerKm: 230 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

const g = toGarminWorkout({ title: "4 x 800m", sport: "run", steps });
const [seg] = g.segments;

assert.equal(g.sport, "RUNNING");
assert.equal(g.workoutProvider, "Diastole");
assert.equal(seg.steps.length, 3);
assert.deepEqual(seg.steps.map((s) => s.stepOrder), [1, 2, 5]); // global ordering incl. nested
const repeat = seg.steps[1] as { type: string; repeatValue: number; steps: { stepOrder: number }[] };
assert.equal(repeat.type, "WorkoutRepeatStep");
assert.equal(repeat.repeatValue, 4);
assert.deepEqual(repeat.steps.map((s) => s.stepOrder), [3, 4]);
const interval = repeat.steps[0] as Record<string, unknown>;
assert.equal(interval.durationType, "DISTANCE");
assert.equal(interval.durationValueType, "METER");
assert.equal(interval.targetType, "PACE");
assert.ok((interval.targetValueLow as number) < (interval.targetValueHigh as number));
assert.equal(seg.steps[0].targetType, "HEART_RATE");
assert.equal(seg.steps[0].targetValue, 2);
assert.equal(seg.steps[2].durationType, "OPEN");
assert.equal(seg.steps[2].targetType, "OPEN");

assert.throws(() => toGarminWorkout({ title: "x", sport: "run", steps: [] }), /at least one step/);
assert.throws(
  () => toGarminWorkout({ title: "x", sport: "run", steps: [{ kind: "repeat", times: 1, steps: [] }] }),
  /Repeat count/,
);

console.log("garmin-format: all checks passed");
