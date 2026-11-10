import assert from "node:assert/strict";

import { cleanEggs, DEFAULT_EGGS, eggCookie, eggsFromCookie, isNightSession, SECRETS, tierOf } from "./secrets.ts";

assert.equal(new Set(SECRETS.map((s) => s.id)).size, SECRETS.length);
const night = SECRETS.find((s) => s.id === "night_shift")!;
assert.deepEqual([0, 1, 9, 10, 25, 99].map((n) => tierOf(night, n)), [0, 1, 1, 2, 3, 3]);
assert.deepEqual(cleanEggs({ heartbeat: "laser", podPosts: true }), { ...DEFAULT_EGGS, podPosts: true });
assert.deepEqual(eggsFromCookie(eggCookie({ ...DEFAULT_EGGS, found: ["blocks"] })).found, ["blocks"]);
assert.deepEqual(eggsFromCookie("%%%"), { ...DEFAULT_EGGS, found: [] });
assert.equal(isNightSession("2026-11-09T08:30:00Z", "America/Chicago"), true, "2:30 a.m. in Chicago");
assert.equal(isNightSession("2026-11-09T12:30:00Z", "America/Chicago"), false, "6:30 a.m.");
console.log("secrets: all passed");
