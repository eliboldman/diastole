// Run with: node lib/fuel/safety.test.ts
import assert from "node:assert/strict";

import { evaluateSafety, isCompleteDay, shouldNotifyAgain, type SafetyDay, type SafetyInput } from "./safety.ts";

// 70 kg, medium days: kcal low target = (350*4 + 110*4 + 55*9) / 50 rounded = 2350; carbs low 350.
const meal = (hour: number, kcal: number, carbs: number) => ({ hour, kcal, carbs });
const fullDay = (date: string, kcalEach: number, carbsEach: number): SafetyDay => ({ date, level: "medium", meals: [meal(8, kcalEach, carbsEach), meal(12.5, kcalEach, carbsEach), meal(19, kcalEach, carbsEach)] });
const dates = ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
const base: SafetyInput = {
  weightKg: 70,
  days: dates.map((d) => fullDay(d, 450, 60)), // ~1350 kcal, 180 g carbs a day: low
  load: { last7Hours: 9, prior28Hours: 24 }, // usual 6 h/week, now 9: +50%
  readiness: ["green", "green", "green", "green", "green", "green", "green"],
  feels: [4, 4, 3],
};

// What counts as a fully logged day.
assert.equal(isCompleteDay(fullDay("x", 1, 1).meals), true);
assert.equal(isCompleteDay([meal(8, 1, 1), meal(12, 1, 1)]), false, "two entries");
assert.equal(isCompleteDay([meal(8, 1, 1), meal(9, 1, 1), meal(10, 1, 1)]), false, "all breakfast, nothing late");
assert.equal(isCompleteDay([meal(8, 1, 1), meal(12, 1, 1), meal(13, 1, 1)]), false, "nothing after 4 pm");
assert.equal(isCompleteDay([meal(12, 1, 1), meal(16.5, 1, 1), meal(19, 1, 1)]), true);

// Low intake + high load: flagged, with a readable summary.
const r = evaluateSafety(base)!;
assert.ok(r);
assert.equal(r.count, 2);
assert.equal(r.signals.intake.completeDays, 7);
assert.equal(r.signals.intake.lowDays, 7);
assert.equal(r.signals.load?.pctAboveUsual, 50);
assert.equal(r.signals.recovery, null);
assert.match(r.summary, /low on 7 of 7 fully logged days · training up 50%/);

// THE POINT: someone who doesn't log, or logs only some meals, is never flagged.
assert.equal(evaluateSafety({ ...base, days: [] }), null, "no logging at all");
assert.equal(evaluateSafety({ ...base, days: dates.map((d) => ({ date: d, level: "medium", meals: [meal(8, 300, 40)] })) }), null, "only logs breakfast");
assert.equal(evaluateSafety({ ...base, days: dates.map((d) => ({ date: d, level: "medium", meals: [meal(8, 300, 40), meal(12, 400, 50)] })) }), null, "logs two meals a day");
assert.equal(evaluateSafety({ ...base, days: base.days.slice(0, 3) }), null, "only 3 fully logged days");
// Fully logged days that look fine, plus partial days that look low: fine.
const mixed = [...dates.slice(0, 4).map((d) => fullDay(d, 900, 130)), ...dates.slice(4).map((d) => ({ date: d, level: "medium" as const, meals: [meal(8, 200, 20)] }))];
assert.equal(evaluateSafety({ ...base, days: mixed }), null);

// Eating enough: nothing, even under heavy load and poor recovery.
assert.equal(evaluateSafety({ ...base, days: dates.map((d) => fullDay(d, 900, 130)), readiness: Array(7).fill("red") }), null);
// Low on only some fully logged days (2 of 5): not "consistently" low.
const some = [...dates.slice(0, 3).map((d) => fullDay(d, 900, 130)), ...dates.slice(3, 5).map((d) => fullDay(d, 450, 60))];
assert.equal(evaluateSafety({ ...base, days: some }), null);

// Low intake alone (normal load, good recovery): no note.
assert.equal(evaluateSafety({ ...base, load: { last7Hours: 6, prior28Hours: 24 } }), null);
// No training history to compare: load signal can't fire.
assert.equal(evaluateSafety({ ...base, load: { last7Hours: 3, prior28Hours: 1 } }), null);
// Low intake + poor recovery (readiness) instead of load.
const rec = evaluateSafety({ ...base, load: { last7Hours: 6, prior28Hours: 24 }, readiness: ["yellow", "red", "green", "yellow", "green", "green", "green"] })!;
assert.equal(rec.count, 2);
assert.match(rec.summary, /readiness yellow or red 3 of the last 7 days/);
// ... or workouts feeling bad.
const feel = evaluateSafety({ ...base, load: { last7Hours: 6, prior28Hours: 24 }, feels: [2, 1, 4, 5] })!;
assert.match(feel.summary, /2 of their last 4 workouts felt bad/);
// All three.
assert.equal(evaluateSafety({ ...base, feels: [1, 2] })!.count, 3);
// No weight: no targets, nothing to compare.
assert.equal(evaluateSafety({ ...base, weightKg: null }), null);

// Quiet period after the coach dismisses.
assert.equal(shouldNotifyAgain(null, r), true);
assert.equal(shouldNotifyAgain({ count: 2, lowDays: 7, decidedDaysAgo: 3 }, r), false);
assert.equal(shouldNotifyAgain({ count: 2, lowDays: 7, decidedDaysAgo: 14 }, r), true);
assert.equal(shouldNotifyAgain({ count: 1, lowDays: 7, decidedDaysAgo: 3 }, r), true, "a new signal joined");
assert.equal(shouldNotifyAgain({ count: 2, lowDays: 4, decidedDaysAgo: 3 }, r), true, "clearly more low days");

console.log("safety: all passed");
