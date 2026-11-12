// Run with: node lib/push/sounds.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { apnsSound, asSound, DEFAULT_SOUND, groupOf, soundGroup } from "./sounds.ts";

assert.equal(groupOf("message", {}), "messages");
assert.equal(groupOf("pod_props", { comment: true }), "comments");
assert.equal(groupOf("pod_props", {}), "props");
assert.equal(groupOf("workout_sent", null), "workouts");
assert.equal(groupOf("pod_invite", null), "pods");
assert.equal(groupOf("pod_challenge", null), "pods");
assert.equal(groupOf("workout_pack", null), "workouts");
assert.equal(groupOf("weekly_digest", null), "coaching");
assert.equal(groupOf("monthly_digest", null), "coaching");
assert.equal(groupOf("workout_recap", null), "workouts");
assert.equal(groupOf("workout_request", null), "coaching");
assert.equal(groupOf("workout_declined", null), "workouts");
assert.equal(groupOf("safety_note", null), "coaching");
assert.equal(groupOf("garmin_disconnected", null), null);
assert.equal(asSound("airhorn", "messages"), "heartbeat");
assert.equal(asSound("chime", "messages"), "chime");
assert.equal(DEFAULT_SOUND.workouts, "chime");
// From the athlete's own coach: the coach sound (duck quack), whatever the kind.
assert.equal(soundGroup("message", {}, true), "coach");
assert.equal(soundGroup("workout_sent", null, true), "coach");
assert.equal(soundGroup("message", {}, false), "messages");
assert.equal(DEFAULT_SOUND.coach, "quack");
assert.equal(apnsSound(asSound(undefined, "coach")), "quack.caf");
assert.equal(apnsSound("heartbeat"), "heartbeat.caf");
assert.equal(apnsSound("default"), "default");
assert.equal(apnsSound("none"), undefined);

// Every coaching kind the database groups as 'coaching' is grouped the same way here.
const sql = readFileSync(new URL("../../supabase/migrations/20261213000000_digest_pack_shoes_challenges.sql", import.meta.url), "utf8");
const kinds = sql.match(/when p_kind in \(([^)]*)\) then 'coaching'/)![1].match(/'([a-z_]+)'/g)!.map((k) => k.slice(1, -1));
for (const k of kinds) assert.equal(groupOf(k, null), "coaching", k);
// And every bundled sound exists in the app and on the web.
for (const id of ["quack", "heartbeat", "chime", "pop", "tone", "tick"]) {
  readFileSync(new URL(`../../ios/Diastole/Sounds/${id}.caf`, import.meta.url));
  readFileSync(new URL(`../../public/sounds/${id}.m4a`, import.meta.url));
}
console.log("push sounds: all passed");
assert.equal(groupOf("refuel", {}), "fuel");
