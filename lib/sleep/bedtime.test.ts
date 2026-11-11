import assert from "node:assert/strict";
import { zonedInstant, bedtimeFor, consistency, DEFAULT_PREFS, defaultGoal, inQuiet, minClock, nudgesFor, recapText, startMin } from "./bedtime.ts";
import { cleanWeek } from "../week-prefs.ts";

const week = cleanWeek({ wed: { sports: ["bike"], window: { start: "06:00", end: "07:30" } } });
const prefs = { ...DEFAULT_PREFS, wake_time: "06:30" };

assert.equal(defaultGoal([]), 480);
assert.equal(defaultGoal([7 * 3600, 7.2 * 3600, 7.5 * 3600, 7.4 * 3600, 6.9 * 3600]), 435); // 7.2 h → 7 h 15

// Tomorrow (Wed) a brick with no time: uses the 6:00 window. 6:00 − 45 min − 8 h = 9:15 pm.
const b = bedtimeFor({ tomorrow: "2026-11-11", plans: [{ title: "Big brick", sport: "bike", start_time: null }], week, prefs, goalMin: 480 })!;
assert.equal(b.basis, "session");
assert.equal(minClock(b.bedtimeMin), "9:15 pm");
// A set start time wins over the window.
assert.equal(minClock(bedtimeFor({ tomorrow: "2026-11-11", plans: [{ title: "Swim", sport: "swim", start_time: "05:30:00" }], week, prefs, goalMin: 480 })!.bedtimeMin), "8:45 pm");
// No session: wake time 6:30 − 8 h = 10:30 pm. No wake time either: no bedtime.
assert.equal(minClock(bedtimeFor({ tomorrow: "2026-11-12", plans: [], week, prefs, goalMin: 480 })!.bedtimeMin), "10:30 pm");
assert.equal(bedtimeFor({ tomorrow: "2026-11-12", plans: [], week, prefs: DEFAULT_PREFS, goalMin: 480 }), null);

// Nudges: 8:15 pm and 9:00 pm; wording names the session.
const n = nudgesFor(b, prefs);
assert.deepEqual(n.map((x) => [x.kind, minClock(x.atMin)]), [["wind", "8:15 pm"], ["lights", "9:00 pm"]]);
assert.match(n[0].body, /^Big brick at 6:00 am tomorrow\. Start winding down so you get your 8 hours\.$/);
assert.match(n[1].body, /lights out by 9:15 pm/);
// Quiet hours from 9:00 pm drop the second; nudges off drops both.
assert.equal(nudgesFor(b, { ...prefs, quiet_start: "21:00" }).length, 1);
assert.equal(nudgesFor(b, { ...prefs, nudges: false }).length, 0);
assert.equal(inQuiet(1470, prefs), true); // 00:30 is inside 22:30–06:00

// Consistency: 20 minutes of slack; a sleep start after midnight counts on the night before.
assert.equal(startMin("2026-11-10", "2026-11-11", "00:10"), 1450);
assert.deepEqual(consistency([{ date: "a", targetMin: 1290, sleepStartMin: 1300 }, { date: "b", targetMin: 1290, sleepStartMin: 1350 }, { date: "c", targetMin: null, sleepStartMin: 1300 }]), { hit: 1, total: 2 });
assert.equal(recapText({ hit: 4, total: 5 }, 6), "You hit your bedtime 4 of 5 nights this week, and your HRV's up 6%. Nice work.");
assert.equal(recapText({ hit: 2, total: 2 }, null), null);
// Local evening times to exact instants, across daylight saving.
assert.equal(zonedInstant("2026-11-10", 21 * 60 + 15, "America/Chicago").toISOString(), "2026-11-11T03:15:00.000Z"); // CST
assert.equal(zonedInstant("2026-07-10", 21 * 60 + 15, "America/Chicago").toISOString(), "2026-07-11T02:15:00.000Z"); // CDT
assert.equal(zonedInstant("2026-11-10", 1470, "America/Chicago").toISOString(), "2026-11-11T06:30:00.000Z"); // 00:30 after midnight
assert.equal(zonedInstant("2026-03-07", 21 * 60, "America/Chicago").toISOString(), "2026-03-08T03:00:00.000Z"); // night before DST starts
console.log("bedtime: all passed");
