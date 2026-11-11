// Run with: node lib/week-prefs.test.ts
import assert from "node:assert/strict";

import { cleanWeek, hasWeek, weekForPrompt } from "./week-prefs.ts";

const w = cleanWeek({ mon: { sports: ["swim", "swim", "dance"], minutes: 62, note: "  pool   before 7  " }, sat: { sports: ["bike"], minutes: 240, note: "group ride" }, sun: { sports: ["rest", "run"], minutes: 30 } });
assert.deepEqual(w.mon, { sports: ["swim"], minutes: 60, note: "pool before 7", window: null });
assert.deepEqual(w.sun, { sports: ["rest"], minutes: null, note: "", window: null }); // rest wins
assert.deepEqual(w.tue, { sports: [], minutes: null, note: "", window: null });
assert.ok(hasWeek(w));
assert.ok(!hasWeek(cleanWeek(null)));
assert.deepEqual(weekForPrompt(w), ["Monday: swim (up to 60 min) - pool before 7", "Saturday: bike (up to 240 min) - group ride", "Sunday: rest"]);
console.log("week prefs: all passed");

// Training windows
{
  const { cleanWeek, windowFor, weekForPrompt, clock12 } = await import("./week-prefs.ts");
  const wk = cleanWeek({ mon: { sports: ["run"], window: { start: "05:00", end: "07:00" } }, tue: { window: { start: "25:00", end: "x" } }, sun: { sports: ["rest"], window: { start: "06:00", end: "07:00" } } });
  assert.deepEqual(wk.mon.window, { start: "05:00", end: "07:00" });
  assert.equal(wk.tue.window, null); // invalid time
  assert.equal(wk.sun.window, null); // rest day has no window
  assert.deepEqual(windowFor(wk, "2026-11-09"), { start: "05:00", end: "07:00" }); // a Monday
  assert.equal(clock12("17:30"), "5:30 pm");
  assert.equal(weekForPrompt(wk)[0], "Monday: run 5:00 am–7:00 am");
  console.log("week windows: passed");
}
