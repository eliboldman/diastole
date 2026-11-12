import assert from "node:assert/strict";

import { BOSS, bonusDamage, BONUS_MAX, candidates, healthLeft, LIMITERS, monthOf, pickLimiter } from "./bosses.ts";

const none = { long: [], climbs: [], swims: [], swimShare: 0, planned: 0, done: 0 };

assert.equal(pickLimiter(none), null, "no data, no boss");

// A big late fade wins over solid consistency.
{
  const p = pickLimiter({ ...none, long: [{ first: 4, last: 3.5 }, { first: 4, last: 3.6 }, { first: 4, last: 3.5 }], planned: 20, done: 19 });
  assert.equal(p?.limiter, "fade");
  assert.ok(p!.value > 10);
}
// Mostly-missed plans: consistency.
assert.equal(pickLimiter({ ...none, planned: 20, done: 12 })?.limiter, "consistency");
// Soft climbing.
assert.equal(pickLimiter({ ...none, climbs: [0.98, 1.0, 1.02] })?.limiter, "climbing");
// Strong everywhere: nothing clear enough.
assert.equal(pickLimiter({ ...none, long: [{ first: 4, last: 4 }, { first: 4, last: 4.05 }, { first: 4, last: 3.98 }], climbs: [1.2, 1.18, 1.25], planned: 20, done: 20 }), null);
// Swims only count when swimming is a real share of training.
assert.equal(candidates({ ...none, swims: [40, 40, 41], swimShare: 0.05 }).length, 0);
assert.equal(candidates({ ...none, swims: [40, 40, 41, 41, 41, 42], swimShare: 0.3 })[0].limiter, "swim");

// Bonus only for real improvement, capped.
assert.equal(bonusDamage("fade", 10, 12), 0, "worse earns nothing");
assert.equal(bonusDamage("fade", 10, 8), 20);
assert.equal(bonusDamage("fade", 10, 0), BONUS_MAX);
assert.equal(bonusDamage("climbing", 1.0, 1.05), 20);
assert.equal(bonusDamage("consistency", 70, 90), BONUS_MAX);
assert.equal(bonusDamage("swim", null, 40), 0);

assert.equal(healthLeft(100, [{ amount: 20 }, { amount: 30 }]), 50);
assert.equal(healthLeft(100, [{ amount: 90 }, { amount: 30 }]), 0);
assert.equal(monthOf("2026-11-11"), "2026-11-01");

// Friendly copy: no weight, food or health words.
for (const k of LIMITERS) {
  const b = BOSS[k];
  assert.doesNotMatch(`${b.name} ${b.intro} ${b.how} ${b.limiter}`, /weigh|calor|diet|food|\bsick|\bill\b|injur|\bfat\b/i, k);
}
console.log("bosses: all passed");
