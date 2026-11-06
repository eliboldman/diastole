// Run with: node lib/fuel/meals.test.ts
import assert from "node:assert/strict";

import { cleanEstimate, confirmItem, dailyTargets, rangeText, ring, signature, slotFor, stepScale, totals, usualMeals, type LoggedItem } from "./meals.ts";

// Targets scale with the day: 70 kg athlete.
const low = dailyTargets(70, "low")!;
const high = dailyTargets(70, "high")!;
assert.deepEqual(low.carbs, { low: 210, high: 350 });
assert.deepEqual(high.carbs, { low: 490, high: 700 });
assert.deepEqual(high.protein, low.protein); // protein doesn't swing with training
assert.deepEqual(low.protein, { low: 110, high: 140 });
assert.ok(high.kcal.low > low.kcal.low);
assert.equal(dailyTargets(null, "high"), null);
assert.equal(dailyTargets(10, "high"), null);

// Rings fill toward the bottom of the range and stay full past it.
assert.deepEqual(ring(105, { low: 210, high: 350 }), { eaten: 105, fill: 0.5, inRange: false, reached: false });
assert.equal(ring(400, { low: 210, high: 350 }).fill, 1);
assert.equal(ring(400, { low: 210, high: 350 }).reached, true);
assert.equal(ring(400, { low: 210, high: 350 }).inRange, false);
assert.equal(ring(50, null).fill, 0);

// Cleaning Claude's output: bad numbers, swapped ranges, empty names, caps.
const cleaned = cleanEstimate([
  { name: "  white   rice ", portion: "1 cup", carbs: [50, 40], protein: [3, 5], fat: [0, 1] },
  { name: "", portion: "x", carbs: [1, 2], protein: [1, 2], fat: [1, 2] },
  { name: "mystery", portion: "", carbs: ["a", 5], protein: [-3, 2], fat: [5000, 6000] },
]);
assert.equal(cleaned.length, 2);
assert.equal(cleaned[0].name, "white rice");
assert.deepEqual(cleaned[0].carbs, [40, 50]);
assert.deepEqual(cleaned[1].carbs, [0, 5]);
assert.deepEqual(cleaned[1].protein, [0, 2]);
assert.deepEqual(cleaned[1].fat, [1000, 1000]);
assert.equal(cleanEstimate("nope").length, 0);
assert.equal(cleanEstimate(Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, carbs: [1, 1], protein: [1, 1], fat: [1, 1] }))).length, 20);

// Confirming: middle of the range times the portion scale; unknown scales fall back to 1.
const rice = cleaned[0];
assert.deepEqual(confirmItem(rice), { name: "white rice", portion: "1 cup", scale: 1, carbs_g: 45, protein_g: 4, fat_g: 0.5 });
assert.equal(confirmItem(rice, 1.5).carbs_g, 67.5);
assert.equal(confirmItem(rice, 7).scale, 1);
assert.equal(stepScale(1, 1), 1.25);
assert.equal(stepScale(0.5, -1), 0.5);
assert.equal(stepScale(2, 1), 2);
assert.equal(stepScale(3, -1), 0.75); // unknown -> treated as 1
assert.equal(rangeText([40, 50]), "40–50 g");
assert.equal(rangeText([4, 5]), "about 5 g");
assert.equal(rangeText([40, 50], 2), "80–100 g");
assert.equal(rangeText([0, 0]), "0 g");
assert.equal(rangeText([0, 1]), "about 1 g");

const t = totals([confirmItem(rice), confirmItem(rice, 2)]);
assert.deepEqual(t, { carbs_g: 135, protein_g: 12, fat_g: 1.5, kcal: Math.round(135 * 4 + 12 * 4 + 1.5 * 9) });

// Meal times.
assert.equal(slotFor(7.5), "breakfast");
assert.equal(slotFor(12), "lunch");
assert.equal(slotFor(19), "dinner");
assert.equal(slotFor(15.5), "snack");
assert.equal(slotFor(23), "snack");

// Repeat meals: same foods in any order/case count together; 3+ times = usual; this slot first.
const item = (name: string): LoggedItem => ({ name, portion: "", scale: 1, carbs_g: 1, protein_g: 1, fat_g: 1 });
assert.equal(signature([item("Oats"), item("banana")]), signature([item("Banana"), item("oats!")]));
const meals = [
  { id: "a", label: "Oats", items: [item("oats"), item("banana")], created_at: "2026-11-01T07:00:00Z", slot: "breakfast" as const },
  { id: "b", label: "Oats", items: [item("Banana"), item("Oats")], created_at: "2026-11-03T07:00:00Z", slot: "breakfast" as const },
  { id: "c", label: "Oats", items: [item("oats"), item("banana")], created_at: "2026-11-02T07:00:00Z", slot: "breakfast" as const },
  { id: "d", label: "Bowl", items: [item("rice"), item("chicken")], created_at: "2026-11-01T12:00:00Z", slot: "lunch" as const },
  { id: "e", label: "Bowl", items: [item("rice"), item("chicken")], created_at: "2026-11-02T12:00:00Z", slot: "lunch" as const },
  { id: "f", label: "Bowl", items: [item("chicken"), item("rice")], created_at: "2026-11-04T12:00:00Z", slot: "lunch" as const },
  { id: "g", label: "Bowl", items: [item("chicken"), item("rice")], created_at: "2026-11-05T12:00:00Z", slot: "lunch" as const },
  { id: "h", label: "Toast", items: [item("toast")], created_at: "2026-11-05T08:00:00Z", slot: "breakfast" as const },
];
const u = usualMeals(meals, (m) => m.slot, "breakfast");
assert.deepEqual(u.map((x) => [x.meal.id, x.times, x.slot]), [["b", 3, "breakfast"], ["g", 4, "lunch"]]);
assert.deepEqual(usualMeals(meals, (m) => m.slot, "lunch").map((x) => x.meal.id), ["g", "b"]);
assert.equal(usualMeals(meals, (m) => m.slot).length, 2); // toast (once) isn't usual

console.log("meals: all passed");
