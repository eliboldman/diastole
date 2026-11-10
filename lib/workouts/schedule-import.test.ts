import assert from "node:assert/strict";
import { parseScheduleCsv, planSchedule } from "./schedule-import.ts";

const csv = `﻿date,title,sport,workoutId
2026-11-09,Old One,running,1
2026-11-10,Brick Run 2,running,1747845731
2026-11-14,"Z2, Filler Miles",running,1747764273
2026-11-21,"Z2, Filler Miles",running,1747764273
2026-11-21,Mystery,running,999
not-a-date,Bad,running,2
2026-11-12,Race Targeting Bike 2,cycling,
`;
const rows = parseScheduleCsv(csv);
assert.equal(rows.length, 6);
assert.equal(rows[2].title, "Z2, Filler Miles");
assert.equal(rows[5].workoutId, null);
assert.deepEqual(parseScheduleCsv("foo,bar\n1,2"), []);

const imported = [
  { libraryId: "a", title: "Brick Run 2", garminId: "1747845731" },
  { libraryId: "b", title: "Z2, Filler Miles", garminId: "1747764273" },
  { libraryId: "c", title: "race targeting bike 2", garminId: null },
  { libraryId: "d", title: "Old One", garminId: "1" },
];
const { add, skipped } = planSchedule(rows, imported, [{ date: "2026-11-21", title: "z2,  filler miles" }], "2026-11-10");
assert.deepEqual(
  add.map((a) => `${a.date} ${a.libraryId}`),
  ["2026-11-10 a", "2026-11-12 c", "2026-11-14 b"],
);
assert.deepEqual(
  skipped.map((s) => s.reason),
  ["date has passed", "already on the calendar", "workout wasn't in the zip"],
);

// The same row twice in one file only lands once.
const twice = planSchedule([rows[1], rows[1]], imported, [], "2026-11-10");
assert.equal(twice.add.length, 1);
assert.equal(twice.skipped[0].reason, "already on the calendar");

console.log("schedule-import ok");
