// Run with: node lib/readiness/source.test.ts
import assert from "node:assert/strict";

import { dominantFamily, familyOf, oneFamily } from "./source.ts";

assert.equal(familyOf("garmin_export"), "garmin");
assert.equal(familyOf("apple"), "apple");

const rows = [
  { date: "2026-10-01", source: "garmin_export", v: 1 },
  { date: "2026-10-02", source: "garmin_export", v: 2 },
  { date: "2026-10-02", source: "garmin", v: 3 }, // live wins over import for the same day
  { date: "2026-10-03", source: "apple", v: 4 },
];
assert.equal(dominantFamily(rows), "garmin");
assert.deepEqual(oneFamily(rows, "garmin").map((r) => r.v), [1, 3]);
assert.deepEqual(oneFamily(rows, "apple").map((r) => r.v), [4]);
console.log("source: all tests passed");
