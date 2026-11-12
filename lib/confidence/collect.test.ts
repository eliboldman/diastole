import assert from "node:assert/strict";

import { collect, readySummary, type CollectInput } from "./collect.ts";

const tz = "America/Chicago";
const at = (d: string, h = 14) => `${d}T${String(h).padStart(2, "0")}:00:00Z`;
const base: CollectInput = { tz, acts: [], checkins: [], readiness: {}, achievements: [], praise: [], prLabel: { pr_5k: "Fastest 5K", consistency_4w: "4 consistent weeks" } };

// Longest runs: each new long best, not shorter ones.
let out = collect({ ...base, acts: [
  { id: "r1", sport: "running", start_time: at("2026-10-01"), duration_s: 80 * 60, name: "Long run" },
  { id: "r2", sport: "running", start_time: at("2026-10-08"), duration_s: 70 * 60, name: null },
  { id: "r3", sport: "running", start_time: at("2026-10-15"), duration_s: 95 * 60, name: null },
] });
assert.deepEqual(out.filter((e) => e.kind === "long").map((e) => e.ref), ["r1", "r3"]);

// A brick: ride then run within 30 min.
out = collect({ ...base, acts: [
  { id: "b", sport: "cycling", start_time: at("2026-10-04", 13), duration_s: 90 * 60, name: null },
  { id: "r", sport: "running", start_time: "2026-10-04T14:40:00Z", duration_s: 20 * 60, name: null },
] });
assert.equal(out.filter((e) => e.kind === "brick").length, 1);

// Tough: low readiness + RPE 7 + 40 min, but not when hurting.
const tough = { ...base, acts: [{ id: "t", sport: "running", start_time: at("2026-10-05"), duration_s: 50 * 60, name: "Tempo" }], readiness: { "2026-10-05": "red" } };
assert.equal(collect({ ...tough, checkins: [{ activity_id: "t", rpe: 8, feel: 3, pain: {}, note: null }] }).filter((e) => e.kind === "tough").length, 1);
assert.equal(collect({ ...tough, checkins: [{ activity_id: "t", rpe: 8, feel: 3, pain: { knee_l: 2 }, note: null }] }).filter((e) => e.kind === "tough").length, 0);

// PRs (not consistency), praise by words, upbeat notes.
out = collect({ ...base, achievements: [{ key: "pr_5k", value: 1200, achieved_at: at("2026-10-06"), activity_id: null }, { key: "consistency_4w", value: null, achieved_at: at("2026-10-06"), activity_id: null }], praise: [{ id: "m1", body: "So proud of that tempo today", created_at: at("2026-10-06") }, { id: "m2", body: "Can you move Thursday?", created_at: at("2026-10-06") }] });
assert.deepEqual(out.map((e) => e.kind), ["pr", "praise"]);

// Summary: facts from the bank, and a kind default when it's empty.
const s = readySummary([{ kind: "pr", ref: "a", title: "Fastest 5K", date: "2026-10-06" }, { kind: "praise", ref: "m1", title: "Your coach said", detail: "So proud", date: "2026-10-06" }], { race: "70.3" });
assert.ok(s.some((l) => l.includes("fastest 5k")));
assert.ok(s.some((l) => l.includes("So proud")));
assert.equal(readySummary([], { race: "x" }).length, 1);
console.log("confidence: all passed");
