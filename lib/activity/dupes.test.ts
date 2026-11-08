import assert from "node:assert/strict";

import { fillsFor, isDuplicate } from "./dupes.ts";

const a = { id: "1", athlete_id: "x", source: "garmin", external_id: "g1", sport: "running", start_time: "2026-11-08T07:00:00Z", duration_s: 3000 };
assert.equal(isDuplicate(a, { ...a, id: "2", source: "apple", external_id: "a1", sport: "Running", start_time: "2026-11-08T07:01:30Z", duration_s: 2950 }), true);
assert.equal(isDuplicate(a, { ...a, id: "2", source: "apple", external_id: "a1", start_time: "2026-11-08T07:10:00Z" }), false, "10 min apart");
assert.equal(isDuplicate(a, { ...a, id: "2", source: "apple", external_id: "a1", sport: "cycling" }), false, "different sport");
assert.equal(isDuplicate(a, { ...a, id: "2", source: "apple", external_id: "a1", duration_s: 1200 }), false, "much shorter");
assert.equal(isDuplicate(a, { ...a, id: "2", athlete_id: "y", source: "apple", external_id: "a1" }), false, "other athlete");
assert.equal(isDuplicate(a, { ...a, id: "2", source: "upload", external_id: "u1", sport: null }), true, "unknown sport still matches");

assert.deepEqual(fillsFor({ avg_hr: null, distance_m: 5000, avg_power: undefined, name: "" }, { avg_hr: 150, distance_m: 5100, name: "Morning run" }), { avg_hr: 150, name: "Morning run" });
console.log("dupes: all passed");
