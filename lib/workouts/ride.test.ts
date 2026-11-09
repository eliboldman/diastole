import assert from "node:assert/strict";

import type { Step } from "./garmin-format.ts";
import { rideSeconds, toRideSteps } from "./ride.ts";

const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 120, high: 150 } },
  {
    kind: "repeat",
    times: 3,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 240 }, target: { type: "power_range", low: 280, high: 300 }, note: "Stay seated" },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 }, target: { type: "hr_zone", zone: 2 } },
    ],
  },
  { kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 5000 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

const ride = toRideSteps(steps);
assert.equal(ride.length, 9);
assert.deepEqual(ride[0], { length: { time: { seconds: 600 } }, intensity: "warmup", low: 120, high: 150 });
assert.deepEqual(ride[1], { length: { time: { seconds: 240 } }, intensity: "interval", low: 280, high: 300, label: "Stay seated" });
assert.deepEqual(ride[2], { length: { time: { seconds: 120 } }, intensity: "recovery", label: "HR zone 2" });
assert.deepEqual(ride[7], { length: { distance: { meters: 5000 } }, intensity: "active" });
assert.deepEqual(ride[8], { length: { open: {} }, intensity: "cooldown" });
assert.equal(rideSeconds(ride), 600 + 3 * 360);

// Bad ranges ride free instead of sending nonsense to the trainer.
const bad = toRideSteps([{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 0 }, target: { type: "power_range", low: 300, high: 200 } }]);
assert.deepEqual(bad, [{ length: { open: {} }, intensity: "active" }]);

// Runaway repeats are capped.
const huge = toRideSteps([{ kind: "repeat", times: 500, steps: [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 10 } }, { kind: "step", intensity: "REST", duration: { type: "time", seconds: 10 } }] }]);
assert.equal(huge.length, 198);
assert.deepEqual(toRideSteps(null as unknown as Step[]), []);

console.log("ride.test.ts: all passed");
