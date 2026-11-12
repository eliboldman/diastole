import assert from "node:assert/strict";

import { checkinStreak, planStreak, planStreakDetail, weekStreak, type ActForStreak } from "./streaks.ts";

const tz = "America/Chicago";
const now = new Date("2026-11-11T18:00:00Z"); // Wednesday
// Three workouts in each of the 3 weeks before this one, one so far this week.
const starts = ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28", "2026-10-30", "2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09"].map((d) => `${d}T14:00:00Z`);
assert.equal(weekStreak(starts, tz, now), 3, "through last week");
assert.equal(weekStreak([...starts, "2026-11-10T14:00:00Z", "2026-11-11T14:00:00Z"], tz, now), 4, "this week counts once it hits 3");
assert.equal(weekStreak(starts.filter((s) => !s.startsWith("2026-10-28")), tz, now), 1, "a short week breaks it");
assert.equal(weekStreak([], tz, now), 0);

const act = (id: string, day: string, sport = "running", planned: string | null = null, mins = 45): ActForStreak => ({ id, start_time: `${day}T14:00:00Z`, sport, duration_s: mins * 60, planned_workout_id: planned });
const plans = [
  { id: "p1", date: "2026-11-05", sport: "run" },
  { id: "p2", date: "2026-11-07", sport: "bike" },
  { id: "p3", date: "2026-11-09", sport: "run" },
  { id: "p4", date: "2026-11-11", sport: "run" },
];
const acts = [act("a1", "2026-11-05"), act("a2", "2026-11-07", "cycling"), act("a3", "2026-11-09")];
assert.equal(planStreak(plans, acts, tz, "2026-11-11"), 3, "today's workout isn't a miss yet");
assert.equal(planStreak(plans, [...acts, act("a4", "2026-11-11")], tz, "2026-11-11"), 4);
assert.equal(planStreak(plans, [act("a1", "2026-11-05"), act("a3", "2026-11-09")], tz, "2026-11-11"), 1, "a missed ride breaks it");
assert.equal(planStreak(plans, [act("x", "2026-11-07", "running", "p2"), act("a3", "2026-11-09")], tz, "2026-11-11"), 2, "a linked workout counts even if the sport differs");

const all = [act("a1", "2026-11-05"), act("a2", "2026-11-07"), act("a3", "2026-11-09"), act("s", "2026-11-10", "running", null, 5), act("t", "2026-11-11")];
assert.equal(checkinStreak(all, new Set(["a1", "a2", "a3"]), now), 3, "today's unchecked workout gets a grace day; short ones don't count");
assert.equal(checkinStreak(all, new Set(["a1", "a3"]), now), 1, "a skipped check-in breaks it");
assert.equal(checkinStreak(all, new Set(["a2", "a3", "t"]), now), 3);
console.log("streaks: all passed");

// Excused days (shield, sick mode, Life happened) don't break the plan streak.
{
  const ps = [
    { id: "e1", date: "2026-11-03", sport: "run" },
    { id: "e2", date: "2026-11-05", sport: "run" },
    { id: "e3", date: "2026-11-07", sport: "run" },
  ];
  const as = [act("x1", "2026-11-03"), act("x3", "2026-11-07")];
  const d = planStreakDetail(ps, as, tz, "2026-11-08");
  assert.equal(d.n, 1);
  assert.equal(d.brokeOn, "2026-11-05", "the miss is reported");
  assert.equal(planStreak(ps, as, tz, "2026-11-08", new Set(["2026-11-05"])), 2, "a shielded miss passes");
}
