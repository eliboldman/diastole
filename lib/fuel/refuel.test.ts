import assert from "node:assert/strict";

import { refuelRows, refuelSummary, type RefuelActivity, type RefuelMeal } from "./refuel.ts";

const tz = "America/Chicago";
const act = (id: string, start: string, min: number): RefuelActivity => ({ id, sport: "running", name: null, start_time: start, duration_s: min * 60 });
const meal = (id: string, at: string, day: string): RefuelMeal => ({ id, eaten_at: at, local_date: day, label: id, carbs_g: 50, protein_g: 20, kcal: 300 });

// Ends 14:00Z (08:00 local). Meals on that local day.
const acts = [
  act("a20", "2026-11-10T13:00:00Z", 60), // ends 14:00 → meal at 14:20 → within 30
  act("a45", "2026-11-11T13:00:00Z", 60), // ends 14:00 → meal at 14:45 → within 60
  act("late", "2026-11-12T13:00:00Z", 60), // ends 14:00 → meal at 16:00 → late (120)
  act("none", "2026-11-13T13:00:00Z", 60), // meals that day but none in 3 h → none
  act("nolog", "2026-11-14T13:00:00Z", 60), // no meals that day → notLogged
  act("short", "2026-11-15T13:00:00Z", 10), // under 20 min → skipped
  act("now", "2026-11-16T13:00:00Z", 60), // ended 20 min before "now" → pending
  act("early", "2026-11-17T13:00:00Z", 60), // logged 5 min before the recorded end → 0 min
];
const meals = [
  meal("m1", "2026-11-10T14:20:00Z", "2026-11-10"),
  meal("m2", "2026-11-11T14:45:00Z", "2026-11-11"),
  meal("m3", "2026-11-12T16:00:00Z", "2026-11-12"),
  meal("m4", "2026-11-13T23:00:00Z", "2026-11-13"),
  meal("m5", "2026-11-13T12:00:00Z", "2026-11-13"), // before the session: not counted
  meal("m6", "2026-11-17T13:55:00Z", "2026-11-17"),
];
const rows = refuelRows(acts, meals, tz, Date.parse("2026-11-16T14:20:00Z"));
const by = Object.fromEntries(rows.map((r) => [r.activity.id, r]));
assert.equal(by.short, undefined);
assert.equal(by.a20.status, "within30");
assert.equal(by.a20.minutes, 20);
assert.equal(by.a45.status, "within60");
assert.equal(by.late.status, "late");
assert.equal(by.late.minutes, 120);
assert.equal(by.none.status, "none");
assert.equal(by.nolog.status, "notLogged");
assert.equal(by.now.status, "pending");
assert.equal(by.early.status, "within30");
assert.equal(by.early.minutes, 0);
assert.equal(rows[0].activity.id, "early"); // newest first

assert.deepEqual(refuelSummary(rows), { sessions: 7, scored: 5, within30: 2, within60: 3 });
console.log("refuel: all passed");
