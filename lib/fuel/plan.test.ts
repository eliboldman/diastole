// Run with: node lib/fuel/plan.test.ts
import assert from "node:assert/strict";

import { dayReason, estimateSession, eveTip, fuelDay, sessionFueling } from "./plan.ts";
import type { Step } from "../workouts/garmin-format.ts";

const zones = { threshold_speed_mps: 1000 / 240, ftp_w: 250 }; // 4:00/km threshold

// Easy 40 min run: short, not hard.
const easy: Step[] = [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2400 }, target: { type: "hr_zone", zone: 2 } }];
const e = estimateSession(easy, "run", zones);
assert.deepEqual([e.minutes, e.hard], [40, false]);

// 6 x 800 m at 3:50/km with 2 min jog, 10 min warm-up/cool-down: hard, ~55 min.
const intervals: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
  {
    kind: "repeat",
    times: 6,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 800 }, target: { type: "pace_range", slowSecPerKm: 235, fastSecPerKm: 225 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];
const iv = estimateSession(intervals, "run", zones);
assert.equal(iv.hard, true);
assert.equal(iv.hardMinutes, 18); // 6 x 800 m at 3:50/km = 18.4 min
assert.ok(iv.minutes! >= 50 && iv.minutes! <= 52, String(iv.minutes));

// Only "until lap" steps (other than warm-up/cool-down): unknown length.
assert.equal(estimateSession([{ kind: "step", intensity: "ACTIVE", duration: { type: "open" } }], "run").minutes, null);
assert.equal(estimateSession([], "bike").minutes, null);

// 3 h ride at 65% FTP: long, not hard.
const long = estimateSession([{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 10800 }, target: { type: "power_range", low: 150, high: 170 } }], "bike", zones);
assert.deepEqual([long.minutes, long.hard], [180, false]);
// Sweet spot 2 x 20 at 90% FTP: hard.
assert.equal(estimateSession([{ kind: "repeat", times: 2, steps: [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 1200 }, target: { type: "power_range", low: 220, high: 230 } }] }], "bike", zones).hard, true);

// Guidance scales.
const during = (s: ReturnType<typeof estimateSession>) => sessionFueling(s).find((l) => l.when === "during")!;
assert.match(during(e).numbers, /No carbs needed/);
assert.match(during(long).numbers, /60–90 g carbs per hour/);
assert.match(during({ sport: "run", minutes: 100, hardMinutes: 0, hard: false }).numbers, /30–60 g carbs per hour/);
assert.match(during({ sport: "swim", minutes: 90, hardMinutes: 0, hard: false }).plain, /at the wall/);
assert.match(sessionFueling(e).find((l) => l.when === "after")!.plain, /next normal meal/);
assert.match(sessionFueling(iv).find((l) => l.when === "after")!.numbers, /20–30 g protein/);
assert.match(sessionFueling(e, { laterToday: true }).find((l) => l.when === "after")!.plain, /later today/);
// Every line has both versions, and none mentions body weight.
for (const s of [e, iv, long]) for (const l of sessionFueling(s)) {
  assert.ok(l.plain && l.numbers);
  assert.doesNotMatch(l.plain + l.numbers, /kg|weight|calorie/i);
}

// Fuel days.
assert.equal(fuelDay([]), "low");
assert.equal(fuelDay([e]), "low");
assert.equal(fuelDay([{ sport: "run", minutes: 50, hardMinutes: 0, hard: false }]), "medium");
assert.equal(fuelDay([iv]), "medium"); // hard but under 75 min
assert.equal(fuelDay([iv, e]), "high"); // hard, 90 min total
assert.equal(fuelDay([long]), "high");
assert.equal(fuelDay([], true), "high");
assert.equal(dayReason([iv, e]), "2 sessions · about 1 h 30 min, including hard efforts.");
assert.equal(dayReason([e]), "1 session · about 40 min.");
assert.equal(dayReason([{ sport: "run", minutes: 118, hardMinutes: 0, hard: false }]), "1 session · about 2 h.");
assert.equal(dayReason([]), "No training planned.");
assert.match(eveTip("high", [long])!.plain, /tonight's dinner/);
assert.equal(eveTip("medium", [e]), null);

console.log("fuel plan: all tests passed");
