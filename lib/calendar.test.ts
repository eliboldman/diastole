// Run with: node lib/calendar.test.ts
import assert from "node:assert/strict";

import { addDays, dayIn, monthGrid, parseMonth, shiftMonth } from "./calendar.ts";

assert.deepEqual(parseMonth("2026-02", "2026-11-03"), { year: 2026, month: 2 });
assert.deepEqual(parseMonth("2026-13", "2026-11-03"), { year: 2026, month: 11 });
assert.deepEqual(parseMonth(undefined, "2026-11-03"), { year: 2026, month: 11 });
assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
assert.equal(addDays("2026-02-28", 1), "2026-03-01");

const nov = monthGrid({ year: 2026, month: 11 }); // Nov 1 2026 is a Sunday
assert.equal(nov[0][0], "2026-11-01");
assert.equal(nov.length, 5);
assert.equal(nov.at(-1)!.at(-1), "2026-12-05");
const feb = monthGrid({ year: 2026, month: 2 }); // Feb 1 2026 is a Sunday, 28 days
assert.equal(feb.length, 4);
const aug = monthGrid({ year: 2026, month: 8 }); // Aug 1 2026 is a Saturday -> 6 rows
assert.equal(aug.length, 6);
assert.equal(aug[0][0], "2026-07-26");
for (const g of [nov, feb, aug]) for (const w of g) assert.equal(w.length, 7);

assert.equal(dayIn("2026-11-03T05:30:00Z", "America/Chicago"), "2026-11-02");
console.log("calendar: all tests passed");
