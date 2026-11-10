import assert from "node:assert/strict";
import { mondayOf, weekReview } from "./week.ts";

assert.equal(mondayOf("2026-11-10"), "2026-11-09"); // Tuesday → Monday
assert.equal(mondayOf("2026-11-15"), "2026-11-09"); // Sunday → Monday

const run45 = [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2700 } }] as never;
const plans = [
  { id: "p1", date: "2026-11-09", sport: "run", title: "Easy", steps: run45, pool: null },
  { id: "p2", date: "2026-11-10", sport: "run", title: "Tempo", steps: run45, pool: null },
  { id: "p3", date: "2026-11-11", sport: "bike", title: "Ride", steps: run45, pool: null },
  { id: "p4", date: "2026-11-12", sport: "run", title: "Later", steps: run45, pool: null },
  { id: "p5", date: "2026-11-08", sport: "run", title: "Last week", steps: run45, pool: null },
];
const acts = [
  // Linked to p1 explicitly
  { id: "a1", start_time: "2026-11-09T14:00:00Z", sport: "running", duration_s: 2800, distance_m: 8000, planned_workout_id: "p1" },
  // Same day + sport as p2, not linked: matched, but short (20 of 45 min)
  { id: "a2", start_time: "2026-11-10T23:30:00Z", sport: "running", duration_s: 1200, distance_m: 3500, planned_workout_id: null },
  // An extra swim
  { id: "a3", start_time: "2026-11-10T12:00:00Z", sport: "lap_swimming", duration_s: 1800, distance_m: 1500, planned_workout_id: null },
];
// Chicago: a2 at 23:30Z on the 10th is 17:30 local on the 10th.
const w = weekReview({ start: "2026-11-09", today: "2026-11-11", tz: "America/Chicago", plans, activities: acts });
assert.equal(w.end, "2026-11-15");
assert.deepEqual(w.sessions.map((s) => [s.plan.id, s.status]), [["p1", "done"], ["p2", "short"], ["p3", "today"], ["p4", "upcoming"]]);
assert.equal(w.due, 2);
assert.equal(w.done, 2);
assert.deepEqual(w.extras.map((a) => a.id), ["a3"]);
const run = w.sports.find((s) => s.family === "run")!;
assert.equal(run.plannedSec, 3 * 2700);
assert.equal(run.doneSec, 4000);
assert.equal(w.sports.find((s) => s.family === "bike")!.plannedM, 0); // no guessed bike distance
console.log("week review: all passed");
