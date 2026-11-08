import assert from "node:assert/strict";

import { parseWorkoutJson, WORKOUT_JSON_PROMPT } from "./json-import.ts";

const ctx = { paceUnit: "mi" as const, ftp: 250 };

// The prompt's own example imports cleanly.
const example = WORKOUT_JSON_PROMPT.slice(WORKOUT_JSON_PROMPT.indexOf("{"), WORKOUT_JSON_PROMPT.lastIndexOf("}\n\nRules") + 1);
const r = parseWorkoutJson(example, ctx);
assert.deepEqual(r.errors, []);
assert.equal(r.workouts.length, 1);
const w = r.workouts[0];
assert.equal(w.sport, "run");
assert.equal(w.date, "2026-12-01");
assert.equal(w.steps.length, 3);
assert.equal(w.steps[1].kind, "repeat");

// Bike with % FTP, a bare array, a single object.
const bike = parseWorkoutJson(JSON.stringify([{ title: "Sweet spot", sport: "cycling", steps: [{ type: "warmup", time: "10:00" }, { type: "interval", time: "20 min", power: "88-94%" }] }]), ctx);
assert.deepEqual(bike.errors, []);
const s = bike.workouts[0].steps[1];
assert.ok(s.kind === "step" && s.target?.type === "power_range" && s.target.low === 220 && s.target.high === 235);

const swim = parseWorkoutJson(JSON.stringify({ title: "Swim", sport: "swim", pool: "25yd", steps: [{ type: "main", distance: "100yd", effort: 5 }] }), ctx);
assert.deepEqual(swim.errors, []);
assert.deepEqual(swim.workouts[0].pool, { length: 25, unit: "YARD" });

// Problems are reported per workout; good ones still come through.
const mixed = parseWorkoutJson(JSON.stringify({ workouts: [{ title: "No sport", steps: [{ time: "10:00" }] }, { title: "OK", sport: "run", steps: [{ time: "30:00" }] }] }), ctx);
assert.equal(mixed.workouts.length, 1);
assert.match(mixed.errors[0], /No sport: sport must be/);
assert.match(parseWorkoutJson("{nope", ctx).errors[0], /valid JSON/);
console.log("json import: all passed");
