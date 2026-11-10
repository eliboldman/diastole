import assert from "node:assert/strict";
import { summarize, workoutTotals } from "./totals.ts";

// Run: 10:00 warm-up, 5 × (3:00 @ 6:00-6:10/km, 2:00 jog), 10:00 cool-down = 45 min.
const run = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
  { kind: "repeat", times: 5, steps: [
    { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 180 }, target: { type: "pace_range", fastSecPerKm: 240, slowSecPerKm: 250 } },
    { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
  ] },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 } },
] as never;
const r = summarize(run, "run", null, "mi");
assert.equal(r.time, "45 min");
assert.ok(r.distance?.startsWith("~"));
assert.equal(r.structure, "Warm-up 10 min · 5 × 3:00 · Cool-down 10 min");
assert.equal(r.hard, "15 min");

// Swim, 25 yd pool: 300 warm-up, 8 × (100 + send-off 2:30), 200 cool-down = 1,300 yd exactly.
const Y = 0.9144;
const swim = [
  { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 300 * Y } },
  { kind: "repeat", times: 8, steps: [
    { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 100 * Y } },
    { kind: "step", intensity: "REST", duration: { type: "sendoff", seconds: 150 } },
  ] },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "distance", meters: 200 * Y } },
] as never;
const pool = { length: 25, unit: "YARD" } as const;
const s = summarize(swim, "swim", pool, "mi");
assert.equal(s.distance, "1,300 yd");
assert.equal(s.structure, "Warm-up 300 yd · 8 × 100 yd · Cool-down 200 yd");
const st = workoutTotals(swim, "swim", pool);
// 8 reps take exactly 8 × 2:30 thanks to the send-off.
assert.equal(Math.round(st.seconds - (300 + 200) * Y / 0.75), 8 * 150);

// Bike by time: no distance guess; open steps reported.
const bike = [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 3600 }, target: { type: "power_range", low: 180, high: 200 } }, { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } }] as never;
const b = summarize(bike, "bike", null, "mi");
assert.equal(b.distance, null);
assert.equal(b.time, "1 h 00 min");
assert.ok(b.note?.includes("1 step"));
console.log("workout totals: all passed");
