// Run with: node lib/workouts/garmin-format.test.ts
import assert from "node:assert/strict";

import { toGarminWorkout, validateSteps, type Pool, type Step } from "./garmin-format.ts";

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

// ---------------------------------------------------------------- swim
const yd: Pool = { length: 25, unit: "YARD" };
const swimSteps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 400 * 0.9144 }, stroke: "CHOICE", target: { type: "swim_effort", level: 3 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 100 * 0.9144 }, stroke: "FREESTYLE", drill: "KICK", equipment: "SWIM_KICKBOARD", target: { type: "swim_pace", secPer100: 100 } },
      { kind: "step", intensity: "REST", duration: { type: "time", seconds: 20 } },
    ],
  },
  { kind: "step", intensity: "REST", duration: { type: "sendoff", seconds: 105 } },
];
const sw = toGarminWorkout({ title: "Kick set", sport: "swim", steps: swimSteps, pool: yd });
assert.equal(sw.sport, "LAP_SWIMMING");
assert.equal(sw.poolLength, 25);
assert.equal(sw.poolLengthUnit, "YARD");
assert.equal(sw.segments[0].poolLengthUnit, "YARD");
const wu = sw.segments[0].steps[0] as Record<string, unknown>;
assert.equal(wu.durationType, "DISTANCE");
assert.equal(wu.durationValue, 365.76, "400 yd in metres");
assert.equal(wu.targetType, null, "swims carry no primary target");
assert.equal(wu.secondaryTargetType, "SWIM_INSTRUCTION");
assert.equal(wu.secondaryTargetValueLow, 3);
assert.equal(wu.strokeType, "CHOICE");
const rep = sw.segments[0].steps[1] as { skipLastRestStep: boolean; steps: Record<string, unknown>[] };
assert.equal(rep.skipLastRestStep, true);
assert.equal(rep.steps[0].secondaryTargetType, "PACE_ZONE");
assert.ok(Math.abs((rep.steps[0].secondaryTargetValueLow as number) - 0.9144) < 1e-9, "1:40/100yd = 0.9144 m/s");
assert.equal(rep.steps[0].drillType, "KICK");
assert.equal(rep.steps[0].equipmentType, "SWIM_KICKBOARD");
assert.equal(rep.steps[1].durationType, "FIXED_REST");
assert.equal(rep.steps[1].strokeType, null, "rest steps have no stroke");
assert.equal((sw.segments[0].steps[2] as Record<string, unknown>).durationType, "FIXED_REPETITION");

// Run output is unchanged by swim support: no pool, no swim fields.
assert.equal(g.poolLength, null);
assert.equal("strokeType" in seg.steps[0], false);

// Swim validation
const one = (s: Step) => validateSteps([s], 0, "swim", yd);
assert.match(one({ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 30 } }).join(), /whole lengths/);
assert.match(one({ kind: "step", intensity: "MAIN", duration: { type: "time", seconds: 30 } }).join(), /1–59 minutes/);
assert.match(one({ kind: "step", intensity: "MAIN", duration: { type: "sendoff", seconds: 90 } }).join(), /rest steps/);
assert.match(one({ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 91.44 }, target: { type: "hr_zone", zone: 2 } }).join(), /effort or pace/);
assert.match(validateSteps([{ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 100 }, target: { type: "swim_pace", secPer100: 90 } }], 0, "swim", null).join(), /pool length/);
assert.deepEqual(one({ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 91.44 } }), []);
assert.match(validateSteps([{ kind: "step", intensity: "MAIN", duration: { type: "open" } }], 0, "run").join(), /for swims/);
assert.match(validateSteps([{ kind: "step", intensity: "ACTIVE", duration: { type: "open" }, stroke: "FREESTYLE" }], 0, "bike").join(), /for swims/);

console.log("garmin-format: all checks passed");

// A pool-less swim written in yards goes to Garmin as a 25 yd pool, so 100 yd shows "100", not "91".
{
  const { inferPool } = await import("./garmin-format.ts");
  const yd = [{ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 91.44 } }, { kind: "step", intensity: "REST", duration: { type: "time", seconds: 20 } }] as never;
  assert.deepEqual(inferPool(yd, null), { length: 25, unit: "YARD" });
  assert.equal(inferPool([{ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 100 } }] as never, null), null);
  assert.deepEqual(inferPool(yd, { length: 50, unit: "METER" }), { length: 50, unit: "METER" });
  const g = toGarminWorkout({ title: "Swim", sport: "swim", steps: yd });
  assert.equal(g.poolLength, 25);
  assert.equal(g.poolLengthUnit, "YARD");
  console.log("inferPool: passed");
}
