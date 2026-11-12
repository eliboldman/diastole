import assert from "node:assert/strict";

import { fireSize, fireWindow, lastWeek, zoned } from "./campfire.ts";

const tz = "America/Chicago";
// Sunday Nov 15 2026, 6 pm Chicago (CST = UTC-6) -> open.
let w = fireWindow(new Date("2026-11-16T00:00:00Z"), tz);
assert.equal(w.open, true);
assert.equal(w.week, "2026-11-15");
assert.equal(w.opensAt, "2026-11-15T23:00:00.000Z");
assert.equal(w.closesAt, "2026-11-16T15:00:00.000Z");
// Monday 8 am Chicago -> still open.
assert.equal(fireWindow(new Date("2026-11-16T14:30:00Z"), tz).open, true);
// Monday 10 am -> closed; next one is the following Sunday.
w = fireWindow(new Date("2026-11-16T16:00:00Z"), tz);
assert.equal(w.open, false);
assert.equal(w.week, "2026-11-22");
// Wednesday -> next Sunday.
assert.equal(fireWindow(new Date("2026-11-11T18:00:00Z"), tz).week, "2026-11-15");
// Sunday 3 pm -> today's, not open yet.
w = fireWindow(new Date("2026-11-15T21:00:00Z"), tz);
assert.equal(w.week, "2026-11-15");
assert.equal(w.open, false);
// Last closed campfire.
assert.equal(lastWeek(new Date("2026-11-11T18:00:00Z"), tz), "2026-11-08");
assert.equal(lastWeek(new Date("2026-11-16T16:00:00Z"), tz), "2026-11-15");
assert.equal(lastWeek(new Date("2026-11-16T00:00:00Z"), tz), "2026-11-08", "while open, last week's is the closed one");
// Daylight saving: summer offset (CDT = UTC-5).
assert.equal(zoned("2026-07-12", 17, tz).toISOString(), "2026-07-12T22:00:00.000Z");
assert.equal(fireSize(3, 6), 0.5);
assert.equal(fireSize(9, 6), 1);
assert.equal(fireSize(0, 0), 0);
console.log("campfire: all passed");
