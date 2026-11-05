// Run with: node lib/pod-stickers.test.ts
import assert from "node:assert/strict";

import { ALL_STICKERS, isSticker, milestone, podAwards, rampStep, sportGroup, sportStickers, unlockedFor, unlockedForActivity } from "./pod-stickers.ts";

const now = new Date("2026-11-03T18:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString().slice(0, 10);

// Secret stickers follow the data.
const tired = unlockedFor(
  {
    readiness: { overall: "red" },
    wellness: [
      ...Array.from({ length: 10 }, (_, i) => ({ date: day(10 - i), hrv_ms: 100, sleep_seconds: 8 * 3600, stress_avg: 25 })),
      { date: day(0), hrv_ms: 80, sleep_seconds: 5 * 3600 + 12 * 60, stress_avg: 50 },
    ],
    activities: [{ start_time: new Date(now.getTime() - 5 * 86_400_000).toISOString(), duration_s: 3600 }],
  },
  now,
);
const keys = tired.map((s) => s.key).sort();
assert.deepEqual(keys, ["blink", "complaint", "couch", "sendhelp", "volcano"]);
assert.match(tired.find((s) => s.key === "blink")!.line!, /^5h12 of sleep/);
assert.match(tired.find((s) => s.key === "complaint")!.line!, /down 20%/);
assert.ok(tired.every((s) => s.secret && isSticker(s.key)));

assert.deepEqual(unlockedFor({ readiness: null, wellness: [], activities: [] }, now), []);
assert.equal(isSticker("goat"), true);
assert.equal(isSticker("drop_table"), false);
for (const k of Object.keys(ALL_STICKERS)) assert.match(k, /^[a-z0-9_]{1,40}$/); // matches the database check

// Holding a sticker reaches 15k+ in about 4.5 s at 80 ms ticks.
let n = 0;
for (let t = 0; t < 4500; t += 80) n += rampStep(t);
assert.ok(n > 15_000 && n < 60_000, `ramp gave ${n}`);
assert.equal(milestone(5), null);
assert.equal(milestone(15_000), "legally a menace");

// Awards need two people with data.
const member = (id: string, sleepH: number, stress: number, mins: number) => ({
  id,
  name: id,
  readiness: null,
  wellness: Array.from({ length: 7 }, (_, i) => ({ date: day(i), hrv_ms: 90, sleep_seconds: sleepH * 3600, stress_avg: stress })),
  activities: [{ start_time: new Date(now.getTime() - 86_400_000).toISOString(), duration_s: mins * 60 }],
});
const awards = podAwards([member("Maya", 8.7, 14, 120), member("Sam", 6.1, 30, 400)], now);
assert.deepEqual(
  awards.map((a) => `${a.title}:${a.winner}`),
  ["Sleep Royalty:Maya", "Vampire Award:Sam", "Most Zen:Maya", "Grindset:Sam"],
);
assert.deepEqual(podAwards([member("Solo", 8, 20, 60)], now), []);
// Activity stickers
for (const k of Object.keys(ALL_STICKERS)) assert.match(k, /^[a-z0-9_]{1,40}$/, `sticker key ${k} must fit the database check`);
assert.equal(new Set(Object.values(ALL_STICKERS).map((s) => s.emoji)).size >= 50, true, "catalog grew");
assert.equal(sportGroup("lap_swimming"), "swim");
assert.equal(sportGroup("indoor_cycling"), "bike");
assert.equal(sportGroup("trail_running"), "run");
assert.equal(sportGroup("yoga"), "other");
assert.ok(sportStickers("open_water_swimming").every((s) => isSticker(s.key)));
assert.deepEqual(sportStickers("yoga"), []);
const actKeys = (a: Parameters<typeof unlockedForActivity>[0]) => unlockedForActivity(a).map((s) => s.key).sort();
assert.deepEqual(actKeys({ sport: "running", local_hour: 5, duration_s: 9000, elevation_gain_m: 600, avg_hr: 170 }), ["dawn", "epic", "goat_climb", "redline"]);
assert.deepEqual(actKeys({ sport: "running", local_hour: 22, duration_s: 600, elevation_gain_m: null, avg_hr: null }), ["owl", "quickie"]);
assert.deepEqual(actKeys({ sport: "strength_training", local_hour: 12, duration_s: 600, elevation_gain_m: null, avg_hr: null }), []);
assert.match(unlockedForActivity({ sport: "run", local_hour: 21, duration_s: null, elevation_gain_m: null, avg_hr: null })[0].line!, /9 PM/);

console.log("pod-stickers: all tests passed");
