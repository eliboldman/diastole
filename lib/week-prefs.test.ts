// Run with: node lib/week-prefs.test.ts
import assert from "node:assert/strict";

import { cleanWeek, hasWeek, weekForPrompt } from "./week-prefs.ts";

const w = cleanWeek({ mon: { sports: ["swim", "swim", "dance"], minutes: 62, note: "  pool   before 7  " }, sat: { sports: ["bike"], minutes: 240, note: "group ride" }, sun: { sports: ["rest", "run"], minutes: 30 } });
assert.deepEqual(w.mon, { sports: ["swim"], minutes: 60, note: "pool before 7" });
assert.deepEqual(w.sun, { sports: ["rest"], minutes: null, note: "" }); // rest wins
assert.deepEqual(w.tue, { sports: [], minutes: null, note: "" });
assert.ok(hasWeek(w));
assert.ok(!hasWeek(cleanWeek(null)));
assert.deepEqual(weekForPrompt(w), ["Monday: swim (up to 60 min) - pool before 7", "Saturday: bike (up to 240 min) - group ride", "Sunday: rest"]);
console.log("week prefs: all passed");
