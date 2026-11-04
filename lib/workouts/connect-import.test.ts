// Run with: node lib/workouts/connect-import.test.ts
// Synthetic files shaped like Garmin Connect workout exports (no personal data).
import assert from "node:assert/strict";

import { fromConnectWorkout } from "./connect-import.ts";
import { toGarminWorkout } from "./garmin-format.ts";

const k = (key: string, value: string) => ({ [key]: value });
const exec = (o: Record<string, unknown>) => ({ type: "ExecutableStepDTO", ...o });

// Connect swim, 25 yd pool, distances stored in yards
const swim = fromConnectWorkout({
  workoutName: "Monday swim",
  description: "Main set focus",
  sportType: k("sportTypeKey", "swimming"),
  poolLength: 25,
  poolLengthUnit: k("unitKey", "yard"),
  workoutSegments: [
    {
      workoutSteps: [
        exec({ stepType: k("stepTypeKey", "warmup"), endCondition: k("conditionTypeKey", "distance"), endConditionValue: 400, preferredEndConditionUnit: k("unitKey", "yard"), strokeType: k("strokeTypeKey", "any_stroke") }),
        {
          type: "RepeatGroupDTO",
          numberOfIterations: 4,
          workoutSteps: [
            exec({
              stepType: k("stepTypeKey", "main"),
              endCondition: k("conditionTypeKey", "distance"),
              endConditionValue: 50,
              preferredEndConditionUnit: k("unitKey", "yard"),
              strokeType: k("strokeTypeKey", "free"),
              equipmentType: k("equipmentTypeKey", "kickboard"),
              drillType: k("drillTypeKey", "kick"),
              secondaryTargetType: k("workoutTargetTypeKey", "swim.instruction"),
              secondaryTargetValueOne: 4,
              description: "Kick with board",
            }),
            exec({ stepType: k("stepTypeKey", "rest"), endCondition: k("conditionTypeKey", "fixed.rest"), endConditionValue: 15 }),
          ],
        },
        { type: "RepeatGroupDTO", numberOfIterations: 1, workoutSteps: [exec({ stepType: k("stepTypeKey", "cooldown"), endCondition: k("conditionTypeKey", "lap.button") })] },
      ],
    },
  ],
});
assert.equal(swim.sport, "swim");
assert.deepEqual(swim.pool, { length: 25, unit: "YARD" });
assert.equal(swim.steps.length, 3, "a 1x repeat becomes plain steps");
assert.deepEqual(swim.steps[0], { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 365.76 }, stroke: "CHOICE" });
const set = swim.steps[1] as { kind: "repeat"; times: number; steps: Record<string, unknown>[] };
assert.equal(set.times, 4);
assert.deepEqual(set.steps[0], {
  kind: "step",
  intensity: "MAIN",
  duration: { type: "distance", meters: 45.72 },
  target: { type: "swim_effort", level: 4 },
  note: "Kick with board",
  stroke: "FREESTYLE",
  equipment: "SWIM_KICKBOARD",
  drill: "KICK",
});
assert.deepEqual(set.steps[1], { kind: "step", intensity: "REST", duration: { type: "time", seconds: 15 } });
assert.deepEqual(swim.skipped, []);
assert.equal(toGarminWorkout(swim).sport, "LAP_SWIMMING", "imported swim is sendable");

// Connect bike with power targets (type "power", watts)
const bike = fromConnectWorkout({
  workoutName: "Power intervals",
  sportType: k("sportTypeKey", "cycling"),
  workoutSegments: [
    { workoutSteps: [exec({ stepType: k("stepTypeKey", "interval"), endCondition: k("conditionTypeKey", "time"), endConditionValue: 60, targetType: k("workoutTargetTypeKey", "power"), targetValueOne: 280, targetValueTwo: 300 })] },
  ],
});
assert.deepEqual(bike.steps[0], { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 60 }, target: { type: "power_range", low: 280, high: 300 } });

// Connect run: distances in metres, HR zone target
const run = fromConnectWorkout({
  workoutName: "Tempo",
  sportType: k("sportTypeKey", "running"),
  workoutSegments: [
    { workoutSteps: [exec({ stepType: k("stepTypeKey", "interval"), endCondition: k("conditionTypeKey", "distance"), endConditionValue: 1609.344, targetType: k("workoutTargetTypeKey", "heart.rate.zone"), zoneNumber: 4 })] },
  ],
});
assert.deepEqual(run.steps[0], { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 1609.34 }, target: { type: "hr_zone", zone: 4 } });

// Hand-written Training-API-style file
const api = fromConnectWorkout({
  workoutName: "Threshold swim",
  sportType: k("sportTypeKey", "swimming"),
  poolLength: 25,
  poolLengthUnit: k("unitKey", "yard"),
  workoutSteps: [
    { type: "ExecutableStepDTO", intensity: "WARMUP", durationType: "DISTANCE", durationValue: 400, durationValueType: "YARD", strokeType: "FREE", equipmentType: "NONE" },
    { type: "ExecutableStepDTO", intensity: "ACTIVE", durationType: "DISTANCE", durationValue: 50, durationValueType: "YARD", strokeType: "DRILL", description: "catch-up" },
  ],
});
assert.deepEqual(api.steps[0], { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 365.76 }, stroke: "FREESTYLE" });
assert.equal((api.steps[1] as { stroke: string }).stroke, "CHOICE");
assert.equal(api.skipped.length, 1, "drill stroke noted");

// Unsupported
assert.throws(() => fromConnectWorkout({ sportType: k("sportTypeKey", "strength_training"), workoutSegments: [] }), /run, bike and swim/);
assert.throws(() => fromConnectWorkout({ sportType: k("sportTypeKey", "running"), workoutSegments: [{ workoutSteps: [] }] }), /no steps/);

console.log("connect-import: all passed");
