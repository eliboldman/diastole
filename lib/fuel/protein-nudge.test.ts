import assert from "node:assert/strict";

import { decideNudge, nudgeMessage, PROTEIN_LINE, type NudgeActivity } from "./protein-nudge.ts";

const MIN = 60_000;
// Run 13:00–14:00Z, uploaded 14:05Z.
const act = (over: Partial<NudgeActivity> = {}): NudgeActivity => ({
  id: "a1",
  sport: "running",
  start_time: "2026-11-12T13:00:00Z",
  duration_s: 3600,
  distance_m: 12000,
  created_at: "2026-11-12T14:05:00Z",
  ...over,
});
const at = (iso: string) => Date.parse(iso);
const now = at("2026-11-12T14:36:00Z"); // 31 min after upload

assert.equal(decideNudge(act(), [], at("2026-11-12T14:30:00Z"), null), "wait", "25 min after upload: wait");
assert.equal(decideNudge(act(), [], now, null), "send", "31 min after upload, nothing eaten: send");
assert.equal(decideNudge(act(), [{ eaten_at: "2026-11-12T14:20:00Z", protein_g: 25 }], now, null), "ate", "protein logged after finishing: quiet");
assert.equal(decideNudge(act(), [{ eaten_at: "2026-11-12T13:55:00Z", protein_g: 25 }], now, null), "ate", "logged 5 min before recorded end still counts");
assert.equal(decideNudge(act(), [{ eaten_at: "2026-11-12T12:00:00Z", protein_g: 40 }], now, null), "send", "pre-workout meal doesn't count");
assert.equal(decideNudge(act(), [{ eaten_at: "2026-11-12T14:20:00Z", protein_g: 2 }], now, null), "send", "a banana (2 g protein) isn't a protein intake");
assert.equal(decideNudge(act({ duration_s: 15 * 60, start_time: "2026-11-12T13:45:00Z" }), [], now, null), "skip", "under 20 min: skip");
assert.equal(decideNudge(act({ start_time: "2026-11-12T09:00:00Z" }), [], now, null), "skip", "finished 4.5 h before: skip (late sync)");
assert.equal(decideNudge(act(), [], at("2026-11-12T16:10:00Z"), null), "skip", "more than 2 h after upload: skip");
assert.equal(decideNudge(act(), [], now, now - 60 * MIN), "skip", "nudged an hour ago (brick / second device): skip");
assert.equal(decideNudge(act(), [], now, now - 4 * 60 * MIN), "send", "last nudge 4 h ago: send");

// Messages: workout-based, end with the protein line, stable per activity.
const m = nudgeMessage(act(), "mi");
assert.ok(m.body.endsWith(PROTEIN_LINE));
assert.deepEqual(nudgeMessage(act(), "mi"), m, "same activity, same message");
assert.ok(!/\{[dt]\}/.test(m.body), "placeholders filled");
const swim = nudgeMessage(act({ id: "s", sport: "lap_swimming", distance_m: 2743, duration_s: 3000 }), "mi");
assert.ok(!/mi\b/.test(swim.body.replace(PROTEIN_LINE, "")) && !/\{/.test(swim.body), "swims in yards, not miles");
const lift = nudgeMessage(act({ id: "l", sport: "strength_training", distance_m: null, duration_s: 2700 }), "km");
assert.ok(lift.body.endsWith(PROTEIN_LINE) && !/\{/.test(lift.body));
// Every line across many ids stays within a lock-screen-friendly length and never mentions weight.
for (let i = 0; i < 200; i++) {
  for (const sport of ["running", "cycling", "lap_swimming", "strength_training", "yoga"]) {
    const x = nudgeMessage(act({ id: `id${i}`, sport, duration_s: 600 + i * 60 }), i % 2 ? "mi" : "km");
    assert.ok(x.body.length <= 260, `too long: ${x.body}`);
    assert.ok(!/\b(weight|weigh|calories?|fat|diet|body|burn)\b/i.test(x.body.replace(PROTEIN_LINE, "")), `no body talk: ${x.body}`);
  }
}
console.log("protein-nudge: all checks pass");

// Dietitian alert.
{
  const { staffMessage, proteinSince } = await import("./protein-nudge.ts");
  const nowS = Date.parse("2026-11-12T14:36:00Z");
  const none = staffMessage(act(), "Walker", "mi", [], nowS, "sent");
  assert.equal(none.title, "Walker finished a run");
  assert.ok(none.body.startsWith("7.5 mi · 60 min, ended 36 min ago."), none.body);
  assert.ok(none.body.includes("nothing logged yet. They've been reminded"));
  const ate = staffMessage(act(), "Walker", "mi", [{ eaten_at: "2026-11-12T14:12:00Z", protein_g: 25 }, { eaten_at: "2026-11-12T14:20:00Z", protein_g: 6 }], nowS, "sent");
  assert.ok(ate.body.endsWith("Protein: 31 g logged since, first 12 min after finishing."), ate.body);
  const little = staffMessage(act(), "Walker", "km", [{ eaten_at: "2026-11-12T14:12:00Z", protein_g: 3 }], nowS, "off");
  assert.ok(little.body.startsWith("12 km") && little.body.endsWith("only 3 g logged since."), little.body);
  const off = staffMessage(act({ sport: "strength_training", distance_m: null }), "Walker", "mi", [], nowS, "off");
  assert.equal(off.title, "Walker finished a strength session");
  assert.ok(off.body.startsWith("60 min, ended") && off.body.includes("turned off"), off.body);
  assert.deepEqual(proteinSince(act(), [{ eaten_at: "2026-11-12T12:00:00Z", protein_g: 40 }], nowS), { grams: 0, firstMin: null }, "pre-workout meal not counted");
  console.log("protein-nudge staff: all checks pass");
}
