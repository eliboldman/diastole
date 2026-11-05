// Run: npm run test:strain
import assert from "node:assert/strict";

import { type Strain, cycle, demandScore, estimateStrain, normalizeStrain, recentStrain, strainFromSets } from "./strain.ts";

// Demand: Garmin load wins; otherwise time x heart-rate intensity.
assert.equal(demandScore({ sport: "running", duration_s: 3600, training_load: 170 }), 1);
const easy = demandScore({ sport: "running", duration_s: 1800, avg_hr: 120, max_hr_athlete: 190 });
const hard = demandScore({ sport: "running", duration_s: 3600, avg_hr: 172, max_hr_athlete: 190 });
assert.ok(easy < 0.2 && hard > 0.6, `easy ${easy} hard ${hard}`);

// A hard run hits calves and quads hardest; arms untouched.
const run = estimateStrain({ sport: "running", duration_s: 5400, avg_hr: 170, max_hr_athlete: 190 });
assert.equal(run.calves, 3);
assert.ok((run.quads ?? 0) >= 2);
assert.equal(run.biceps, undefined);
// An easy jog only lightly.
const jog = estimateStrain({ sport: "running", duration_s: 1500, avg_hr: 125, max_hr_athlete: 190 });
assert.ok(Object.values(jog).every((l) => l <= 2), JSON.stringify(jog));
// Swims are upper body; breaststroke adds adductors.
const swim = estimateStrain({ sport: "lap_swimming", duration_s: 3000, training_load: 120, swim_stroke: "breaststroke" });
assert.ok(swim.lats && swim.shoulders && swim.adductors, JSON.stringify(swim));
// Hills add glutes on a hike.
const flat = estimateStrain({ sport: "hiking", duration_s: 7200, distance_m: 10000, elevation_gain_m: 50, training_load: 80 });
const hill = estimateStrain({ sport: "hiking", duration_s: 7200, distance_m: 10000, elevation_gain_m: 600, training_load: 80 });
assert.ok((hill.glutes ?? 0) >= (flat.glutes ?? 0));
// Unknown sports get no guess (the athlete can still mark it).
assert.deepEqual(estimateStrain({ sport: "breathwork", duration_s: 600 }), {});

// Strength: more sets, brighter.
const legDay = strainFromSets([...Array(5)].map(() => ({ category: "squat" })).concat([{ category: "calf_raise" }]));
assert.equal(legDay.quads, 2);
assert.equal(legDay.glutes, 2);
assert.equal(legDay.calves, 1);
assert.equal(strainFromSets([...Array(7)].map(() => ({ category: "bench_press" }))).chest, 3);
assert.deepEqual(strainFromSets([{ category: "made_up" }]), {});

// Tapping cycles none -> light -> moderate -> hard -> none.
let s: Strain = {};
s = cycle(s, "quads");
assert.deepEqual(s, { quads: 1 });
s = cycle(cycle(cycle(s, "quads"), "quads"), "quads");
assert.deepEqual(s, {});

assert.deepEqual(normalizeStrain({ quads: 2, nose: 3, calves: 7 }), { quads: 2 });

// Recovery fades over three days.
const now = Date.parse("2026-11-05T12:00:00Z");
const r = recentStrain(
  [
    { strain: { quads: 3 }, at: "2026-11-05T07:00:00Z" },
    { strain: { lats: 3 }, at: "2026-11-03T20:00:00Z" },
    { strain: { calves: 3 }, at: "2026-11-01T07:00:00Z" },
  ],
  now,
);
assert.deepEqual(r, { quads: 3, lats: 2 }, "hard 40 h ago is still moderate; 4 days ago has faded");

console.log("strain: all passed");
