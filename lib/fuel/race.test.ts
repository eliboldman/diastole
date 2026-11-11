// Run with: node lib/fuel/race.test.ts
import assert from "node:assert/strict";

import { daysUntil, gutMax, parseGoalTime, raceMinutes, racePlan, raceWeekChecklist, sweatRate } from "./race.ts";

// Durations
assert.equal(raceMinutes({ sport: "run", distance_km: 21.1, goal_seconds: 5400 }), 90); // goal wins
assert.equal(raceMinutes({ sport: "run", distance_km: 10, goal_seconds: null }), 52);
assert.equal(raceMinutes({ sport: "tri", distance_km: 113, goal_seconds: null }), 330);
assert.equal(raceMinutes({ sport: "other", distance_km: null, goal_seconds: null }), null);

assert.equal(daysUntil("2026-11-16", "2026-11-06"), 10);
assert.equal(daysUntil("2026-11-06", "2026-11-06"), 0);

// Short race: no carbs during, drink to thirst, no carb load.
const fiveK = racePlan({ minutes: 22, sport: "run", weightKg: 60, sweatRateMlH: 900, gutMaxCarbs: null });
assert.equal(fiveK.carbsPerHour, 0);
assert.equal(fiveK.fluidMlPerHour, null);
assert.equal(fiveK.carbLoad, null);
assert.equal(fiveK.feeds.length, 0);

// Half marathon at 95 min: 60 g/h, fluid from sweat rate (70%), one carb-load day.
const half = racePlan({ minutes: 95, sport: "run", weightKg: 60, sweatRateMlH: 1000, gutMaxCarbs: 70 });
assert.equal(half.carbsPerHour, 60);
assert.equal(half.fluidMlPerHour, 700);
assert.equal(half.sodiumMgPerHour, 500);
assert.deepEqual(half.carbLoad, { days: 1, gPerKg: [8, 10], grams: [480, 600] });
assert.deepEqual(half.breakfast.grams, [60, 180]);
assert.deepEqual(half.feeds.map((f) => f.minute), [20, 40, 60, 80]);
assert.equal(half.feeds[0].carbs, 20);

// Long race without gut training: held at 60 with a nudge. With training at 75: capped at 85.
const long = racePlan({ minutes: 330, sport: "tri", weightKg: 70, sweatRateMlH: null, gutMaxCarbs: null });
assert.equal(long.carbsPerHour, 60);
assert.equal(long.fluidMlPerHour, 500);
assert.ok(long.notes.some((n) => /sweat-rate/.test(n)));
assert.ok(long.feeds[0].minute >= 50); // tri feeds start on the bike
assert.equal(racePlan({ minutes: 330, sport: "tri", weightKg: 70, sweatRateMlH: 1500, gutMaxCarbs: 75 }).carbsPerHour, 85);
assert.equal(racePlan({ minutes: 330, sport: "tri", weightKg: 70, sweatRateMlH: 1500, gutMaxCarbs: 75 }).fluidMlPerHour, 800); // capped
assert.equal(racePlan({ minutes: 330, sport: "tri", weightKg: 70, sweatRateMlH: 1500, gutMaxCarbs: 75 }).sodiumMgPerHour, 700);

// Sweat rate: 1 kg lost + 500 ml drunk over 60 min = 1500 ml/h; bad input -> null.
assert.equal(sweatRate({ preKg: 70, postKg: 69, drankMl: 500, minutes: 60 }), 1500);
assert.equal(sweatRate({ preKg: 70, postKg: 69.5, drankMl: 250, peedMl: 0, minutes: 45 }), 1000);
assert.equal(sweatRate({ preKg: 70, postKg: 71, drankMl: 0, minutes: 60 }), null);
assert.equal(sweatRate({ preKg: 70, postKg: 69, drankMl: 0, minutes: 5 }), null);

assert.equal(gutMax([{ carbs_g_per_h: 60, comfort: 5 }, { carbs_g_per_h: 90, comfort: 2 }, { carbs_g_per_h: 75, comfort: 4 }]), 75);
assert.equal(gutMax([]), null);

// Checklist phases
assert.equal(raceWeekChecklist(9, half).title, "Lock it in");
assert.equal(raceWeekChecklist(5, half).title, "Taper");
assert.equal(raceWeekChecklist(2, half).title, "Carb load");
assert.ok(raceWeekChecklist(2, half).items[0].label.includes("480–600 g"));
assert.equal(raceWeekChecklist(1, half).title, "Tomorrow's the day");
assert.equal(raceWeekChecklist(0, half).title, "Race morning");

// Goal times: "3:55" is h:mm for a 70.3, m:ss is right for a 5K.
const tri703 = { sport: "tri" as const, distance_km: 113.1 };
assert.equal(parseGoalTime("3:55", tri703), 3 * 3600 + 55 * 60, "70.3 goal 3:55 is hours");
assert.equal(parseGoalTime("5:30", { sport: "tri", distance_km: 113 }), 5.5 * 3600);
assert.equal(parseGoalTime("21:30", { sport: "run", distance_km: 5 }), 21 * 60 + 30, "5K 21:30 is minutes");
assert.equal(parseGoalTime("45:00", { sport: "run", distance_km: 10 }), 45 * 60);
assert.equal(parseGoalTime("1:45", { sport: "run", distance_km: 21.1 }), 105 * 60, "half 1:45 is hours");
assert.equal(parseGoalTime("1:45:00", { sport: "run", distance_km: 21.1 }), 105 * 60);
assert.equal(parseGoalTime("3:30", { sport: "run", distance_km: 42.2 }), 210 * 60);
assert.equal(parseGoalTime("2:30", { sport: "bike", distance_km: 80 }), 150 * 60);
assert.equal(parseGoalTime("25:00", { sport: "swim", distance_km: 1.5 }), 25 * 60);
assert.equal(parseGoalTime("3:55"), 3 * 3600 + 55 * 60, "no distance: single-digit hours");
assert.equal(parseGoalTime("25:00"), 25 * 60, "no distance: two digits are minutes");
assert.equal(parseGoalTime("90"), 90 * 60, "bare number is minutes");
assert.equal(parseGoalTime("3:75", tri703), null, "seconds/minutes over 59");
assert.equal(parseGoalTime("::", tri703), null);
assert.equal(parseGoalTime("", tri703), null);
assert.equal(raceMinutes({ sport: "tri", distance_km: 113, goal_seconds: parseGoalTime("3:55", tri703) }), 235);

console.log("race: all passed");
