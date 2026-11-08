// Run with: node lib/story.test.ts
import assert from "node:assert/strict";

import { asPeriod, buildStory, periodRange, prevMonth } from "./story.ts";

const act = (sport: string, day: string, min: number, km: number) => ({ sport, start_time: `${day}T07:00:00Z`, duration_s: min * 60, distance_m: km * 1000 });
const s = buildStory({
  activities: [
    act("running", "2026-10-05", 50, 10), // Mon, week 1
    act("cycling", "2026-10-07", 120, 60),
    act("lap_swimming", "2026-10-13", 40, 2), // week 2
    act("running", "2026-10-21", 95, 19), // week 3
    act("running", "2026-11-02", 45, 9), // week 5 (gap in week 4)
    act("walking", "2026-11-03", 3, 0.2), // under 5 min: ignored
  ],
  prs: 2,
  races: 1,
  readiness: ["green", "green", "yellow", "green", "red", "green", "green", "unknown"],
});
assert.equal(s.workouts, 5);
assert.equal(s.hours, 5.8);
assert.deepEqual(s.bySport.map((x) => x.key), ["run", "bike", "swim"]);
assert.equal(s.bySport[0].km, 38);
assert.deepEqual(s.longest, { label: "Bike", minutes: 120 });
assert.equal(s.bestStreakWeeks, 3);
assert.equal(s.readyPct, 71); // 5 of 7 flagged days
assert.equal(buildStory({ activities: [], prs: 0, races: 0, readiness: ["green"] }).readyPct, null);
assert.equal(asPeriod("year"), "year");
assert.equal(asPeriod("forever"), "quarter");
assert.equal(asPeriod("2026-10"), "2026-10");
assert.equal(asPeriod("2026-13"), "quarter");
assert.equal(prevMonth("2026-01"), "2025-12");
assert.deepEqual(periodRange("2026-12", "2027-01-01"), { from: "2026-12-01", to: "2027-01-01", label: "December 2026", heading: "December", monthly: true });
assert.equal(periodRange("month", "2026-11-08").from, "2026-10-10");
assert.equal(periodRange("month", "2026-11-08").to, "2026-11-09");
console.log("story: all passed");
