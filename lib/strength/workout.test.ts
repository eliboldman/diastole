import assert from "node:assert/strict";
import { applyChanges, describeStrength, heavyLegs, lightenLegs, progress, strengthLoad, strengthSeconds, toGarminStrength, validateStrength } from "./workout.ts";

const plan = [
  { slug: "back-squat", sets: 3, reps: 5, seconds: null, kg: 60, tempo: "3-1-1", rest_s: 120 },
  { slug: "push-up", sets: 3, reps: 10, seconds: null, kg: null, rest_s: 60 },
  { slug: "side-plank", sets: 2, reps: null, seconds: 30, kg: null, rest_s: 30 },
];
assert.deepEqual(validateStrength(plan), []);
assert.ok(validateStrength([{ slug: "back-squat", sets: 0, reps: 5, seconds: null, kg: 60, rest_s: 60 }]).length);
assert.ok(validateStrength([{ slug: "plank", sets: 2, reps: 10, seconds: null, kg: null, rest_s: 30 }])[0].includes("hold"));
assert.deepEqual(describeStrength(plan), ["Back squat 3 × 5 @ 60 kg · rest 2:00 · tempo 3-1-1", "Push-up 3 × 10 · rest 1:00", "Side plank 2 × 30 s each side · rest 0:30"]);
assert.equal(describeStrength(plan, "lb")[0].includes("132 lb"), true);
assert.ok(strengthSeconds(plan) > 600 && strengthSeconds(plan) < 1500);

// Garmin: a repeat per exercise with work + rest, reps or time, kg and Garmin names.
const g = toGarminStrength("Strength A", plan) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
assert.equal(g.sport, "STRENGTH_TRAINING");
assert.equal(g.segments[0].steps[0].type, "WorkoutRepeatStep");
assert.equal(g.segments[0].steps[0].repeatValue, 3);
assert.deepEqual([g.segments[0].steps[0].steps[0].exerciseCategory, g.segments[0].steps[0].steps[0].exerciseName, g.segments[0].steps[0].steps[0].durationType, g.segments[0].steps[0].steps[0].weightValue], ["SQUAT", "BARBELL_BACK_SQUAT", "REPS", 60]);
assert.equal(g.segments[0].steps[2].steps[0].durationType, "TIME");
assert.equal(g.segments[0].steps[0].steps[1].intensity, "REST");

// Progression: all reps at RPE 6 → +5 kg legs, +1 rep push-ups, +5 s holds.
const all = (n: number, kg: number | null, sets = 3) => Array.from({ length: sets }, () => ({ reps: n, kg, seconds: null }));
const logged = [{ slug: "back-squat", sets: all(5, 60) }, { slug: "push-up", sets: all(10, null) }, { slug: "side-plank", sets: [{ reps: null, kg: null, seconds: 30 }, { reps: null, kg: null, seconds: 32 }] }];
const up = progress(plan, logged, 6);
assert.deepEqual(up.map((c) => [c.slug, c.to.kg ?? c.to.reps ?? c.to.seconds]), [["back-squat", 65], ["push-up", 11], ["side-plank", 35]]);
// RPE 8: hold everything. RPE 6 but key session next day: legs held, upper still progresses.
assert.equal(progress(plan, logged, 8).length, 0);
assert.deepEqual(progress(plan, logged, 6, undefined, true).map((c) => c.slug), ["push-up", "side-plank"]);
// Missed reps: 10% lighter (rounded to 1.25 kg).
const missed = progress(plan, [{ slug: "back-squat", sets: [{ reps: 5, kg: 60, seconds: null }, { reps: 3, kg: 60, seconds: null }, { reps: 3, kg: 60, seconds: null }] }], 9);
assert.equal(missed[0].to.kg, 53.75);
assert.equal(applyChanges(plan, up)[0].kg, 65);

assert.deepEqual(heavyLegs(plan), ["Back squat"]);
assert.equal(lightenLegs(plan)[0].kg, 47.5); // 48 kg to the nearest 1.25
assert.equal(strengthLoad(3600, 10), 100);
console.log("strength: all passed");
