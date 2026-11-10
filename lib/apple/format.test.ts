import assert from "node:assert/strict";

import { toAppleWorkout } from "./format.ts";

const base = { id: "w1", date: "2026-11-10", title: "Over-unders" };

// Warmup, a repeat, cooldown.
const ou = toAppleWorkout({
  ...base,
  sport: "run",
  steps: [
    { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 2 } },
    {
      kind: "repeat",
      times: 4,
      steps: [
        { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 1000 }, target: { type: "pace_range", slowSecPerKm: 250, fastSecPerKm: 240 } },
        { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 90 } },
      ],
    },
    { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
  ],
});
assert.ok(ou);
assert.equal(ou.activity, "running");
assert.deepEqual(ou.warmup, { goal: { type: "time", seconds: 600 }, alert: { type: "hrZone", zone: 2 } });
assert.equal(ou.blocks.length, 1);
assert.equal(ou.blocks[0].iterations, 4);
assert.deepEqual(ou.blocks[0].steps.map((s) => s.purpose), ["work", "recovery"]);
assert.deepEqual(ou.blocks[0].steps[0].alert, { type: "speed", low: 4, high: 4.167 });
assert.deepEqual(ou.cooldown, { goal: { type: "open" } });

// Repeats inside repeats are expanded; plain steps between repeats become a block done once.
const nested = toAppleWorkout({
  ...base,
  sport: "bike",
  steps: [
    { kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 300 }, target: { type: "power_range", low: 200, high: 220 } },
    { kind: "repeat", times: 2, steps: [{ kind: "repeat", times: 3, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 30 } }] }] },
  ],
});
assert.ok(nested);
assert.equal(nested.warmup, undefined);
assert.deepEqual(nested.blocks.map((b) => [b.iterations, b.steps.length]), [[1, 1], [2, 3]]);
assert.deepEqual(nested.blocks[0].steps[0].alert, { type: "power", low: 200, high: 220 });

// Swims carry the pool; swim effort has no Apple alert but the step stays.
const swim = toAppleWorkout({
  ...base,
  sport: "swim",
  pool: { length: 25, unit: "YARD" },
  steps: [{ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 91.44 }, target: { type: "swim_effort", level: 3 }, note: "Kick" }],
});
assert.ok(swim);
assert.deepEqual(swim.pool, { length: 25, unit: "yd" });
assert.deepEqual(swim.blocks[0].steps[0], { purpose: "work", goal: { type: "distance", meters: 91.4, yards: 100 }, name: "Kick" });

// Unsupported sports and empty workouts aren't scheduled.
assert.equal(toAppleWorkout({ ...base, sport: "strength", steps: [] }), null);
assert.equal(toAppleWorkout({ ...base, sport: "run", steps: [] }), null);

console.log("apple format: all passed");
