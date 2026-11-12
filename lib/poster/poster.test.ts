import assert from "node:assert/strict";

import { grayOf, isKey, posterState, REGIONS, windowStart, type KeySession } from "./poster.ts";

assert.equal(isKey({ minutes: 75, hard: false }), true);
assert.equal(isKey({ minutes: 40, hard: true }), true);
assert.equal(isKey({ minutes: 40, hard: false }), false);
assert.equal(windowStart("2026-12-20", "2026-01-01T00:00:00Z"), "2026-08-30", "16 weeks back");
assert.equal(windowStart("2026-12-20", "2026-11-01T00:00:00Z"), "2026-11-01", "or when it was added");

const ks = (n: number, done: number): KeySession[] => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, date: `2026-11-${String(i + 1).padStart(2, "0")}`, title: `S${i}`, status: i < done ? "done" : "open" }));
// 24 sessions over 12 regions: two each; 12 done fills the first 6.
let s = posterState(ks(24, 12), "2026-12-20", "2026-11-25");
assert.equal(s.regions.length, REGIONS);
assert.equal(s.colored, 6);
assert.equal(s.finished, false);
// Every session lands somewhere.
assert.equal(s.regions.reduce((n, r) => n + r.sessions.length, 0), 24);
// Excused counts as filled.
const ex = ks(12, 0).map((k, i) => (i === 0 ? { ...k, status: "excused" as const } : k));
assert.equal(posterState(ex, "2026-12-20", "2026-11-25").regions[0].colored, true);
// Race day: everything in color, even with nothing done or no sessions at all.
assert.equal(posterState(ks(10, 0), "2026-12-20", "2026-12-20").colored, REGIONS);
assert.equal(posterState([], "2026-12-20", "2026-12-20").colored, REGIONS);
assert.equal(posterState([], "2026-12-20", "2026-12-01").colored, 0);
// Few sessions: some regions are empty (they wait for race day).
s = posterState(ks(3, 3), "2026-12-20", "2026-11-25");
assert.equal(s.colored, 3);
assert.match(grayOf("#ff0000"), /^#[0-9a-f]{6}$/);
console.log("poster: all passed");
