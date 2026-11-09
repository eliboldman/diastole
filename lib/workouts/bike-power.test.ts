import assert from "node:assert/strict";

import { bikeStepsToPower } from "./bike-power.ts";
import type { Step } from "./garmin-format.ts";

const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 1 }, note: "Very easy build" },
  { kind: "repeat", times: 2, steps: [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 1800 }, target: { type: "hr_range", low: 135, high: 149 } }] },
  { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 300 }, target: { type: "power_range", low: 250, high: 260 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

// FTP 231, max HR 190: Z1 → 45-55% → 105-125 W (to 5 W); 135-149 of 190 = 75% max → Z3 → 76-88%.
const out = bikeStepsToPower(steps, 231, 190);
assert.deepEqual(out[0], { ...steps[0], target: { type: "power_range", low: 105, high: 125 } });
assert.deepEqual((out[1] as Extract<Step, { kind: "repeat" }>).steps[0].kind === "step" && (out[1] as Extract<Step, { kind: "repeat" }>).steps[0], { ...(steps[1] as Extract<Step, { kind: "repeat" }>).steps[0], target: { type: "power_range", low: 175, high: 205 } });
assert.deepEqual(out[2], steps[2]); // power stays as it was
assert.deepEqual(out[3], steps[3]);
assert.equal(bikeStepsToPower(steps, null, 190), steps); // no FTP: unchanged

console.log("bike-power: all passed");
