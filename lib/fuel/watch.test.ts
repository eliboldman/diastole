// Run with: node lib/fuel/watch.test.ts
import assert from "node:assert/strict";

import { reminders, watchFuel } from "./watch.ts";

assert.equal(watchFuel(45), null, "under an hour: nothing");
assert.equal(watchFuel(65), null, "an easy hour: nothing");
assert.equal(watchFuel(65, { hard: true })?.carbs, 10, "a hard hour: sip a drink");
assert.equal(watchFuel(120, { swim: true }), null, "swims don't buzz");
const mid = watchFuel(90)!;
assert.equal(mid.first, 35 * 60);
assert.equal(mid.carbs * (3600 / mid.every) >= 30 && mid.carbs * (3600 / mid.every) <= 60, true, "30–60 g/h");
const long = watchFuel(240)!;
const perHour = long.carbs * (3600 / long.every);
assert.equal(perHour >= 60 && perHour <= 90, true, `60–90 g/h (got ${perHour})`);
assert.equal(reminders(mid, 90), 2, "35 and 70 min");
assert.equal(reminders(long, 240), 9);
assert.equal(reminders(null, 240), 0);
console.log("watch fuel: passed");
