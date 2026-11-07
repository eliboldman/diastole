// Run with: node lib/fuel/barcode.test.ts
import assert from "node:assert/strict";

import { isBarcode, productItem } from "./barcode.ts";

assert.ok(isBarcode("0123456789012"));
assert.ok(!isBarcode("12ab"));
assert.ok(!isBarcode("123"));

// Per-serving numbers win.
const bar = productItem({ product_name: "Oat Bar", brands: "Trailmix Co, Other", serving_size: "40 g", serving_quantity: 40, nutriments: { carbohydrates_serving: 26.4, proteins_serving: 4, fat_serving: 6.1, carbohydrates_100g: 66 } });
assert.deepEqual(bar, { item: { name: "Trailmix Co Oat Bar", portion: "1 serving (40 g)", carbs: [26.4, 26.4], protein: [4, 4], fat: [6.1, 6.1] }, label: "Trailmix Co Oat Bar" });

// Serving size known but only per-100 g numbers: scaled.
const gel = productItem({ product_name: "Energy Gel", serving_size: "60 g", serving_quantity: "60", nutriments: { carbohydrates_100g: 37.5, proteins_100g: "0", fat_100g: 0 } });
assert.deepEqual(gel?.item.carbs, [22.5, 22.5]);
assert.equal(gel?.item.portion, "1 serving (60 g)");

// Nothing about servings: per 100 g.
const rice = productItem({ product_name: "Rice", nutriments: { carbohydrates_100g: 78, proteins_100g: 7, fat_100g: 0.6 } });
assert.equal(rice?.item.portion, "100 g");

// Missing numbers: no item.
assert.equal(productItem({ product_name: "Mystery", nutriments: { carbohydrates_100g: 10 } }), null);
assert.equal(productItem(null), null);
console.log("barcode: all passed");
