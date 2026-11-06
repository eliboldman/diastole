// Run with: node lib/push/sounds.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { apnsSound, asSound, DEFAULT_SOUND, groupOf } from "./sounds.ts";

assert.equal(groupOf("message", {}), "messages");
assert.equal(groupOf("pod_props", { comment: true }), "comments");
assert.equal(groupOf("pod_props", {}), "props");
assert.equal(groupOf("workout_sent", null), "workouts");
assert.equal(groupOf("pod_invite", null), "pods");
assert.equal(groupOf("safety_note", null), "coaching");
assert.equal(groupOf("garmin_disconnected", null), null);
assert.equal(asSound("airhorn", "messages"), "heartbeat");
assert.equal(asSound("chime", "messages"), "chime");
assert.equal(DEFAULT_SOUND.workouts, "chime");
assert.equal(apnsSound("heartbeat"), "heartbeat.caf");
assert.equal(apnsSound("default"), "default");
assert.equal(apnsSound("none"), undefined);

// Every coaching kind the database groups as 'coaching' is grouped the same way here.
const sql = readFileSync(new URL("../../supabase/migrations/20261130000000_safety_notes.sql", import.meta.url), "utf8");
const kinds = sql.match(/when p_kind in \(([^)]*)\) then 'coaching'/)![1].match(/'([a-z_]+)'/g)!.map((k) => k.slice(1, -1));
for (const k of kinds) assert.equal(groupOf(k, null), "coaching", k);
// And every bundled sound exists in the app and on the web.
for (const id of ["heartbeat", "chime", "pop", "tone", "tick"]) {
  readFileSync(new URL(`../../ios/Diastole/Sounds/${id}.caf`, import.meta.url));
  readFileSync(new URL(`../../public/sounds/${id}.m4a`, import.meta.url));
}
console.log("push sounds: all passed");
