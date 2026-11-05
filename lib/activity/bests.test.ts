// Run: npm run test:bests
import assert from "node:assert/strict";

import { bestAverage, bestsOf, fastestOver } from "./bests.ts";

// 5 s samples at 4 m/s for 30 min, with a faster stretch (5 m/s) in the middle.
const t: number[] = [];
const dist: number[] = [];
let d = 0;
for (let s = 0; s <= 1800; s += 5) {
  t.push(s);
  dist.push(d);
  d += (s >= 600 && s < 1000 ? 5 : 4) * 5;
}
// 1 mile all at 5 m/s would be 321.9 s; the fast stretch is 2000 m long, so the best mile is inside it.
assert.equal(fastestOver(t, dist, 1609.344), 322);
assert.equal(fastestOver(t, dist, 100000), null, "too short");
const five = fastestOver(t, dist, 5000)!;
assert.ok(five > 1000 && five < 1250, `5K ${five}`);

assert.equal(bestAverage([100, 100, 300, 300, 100], 5, 10), 300);
assert.equal(bestAverage([100, null, 100], 5, 15), 67, "gaps count as coasting");
assert.equal(bestAverage([100], 5, 10), null);

const b = bestsOf({ interval_s: 5, t, dist }, "running");
assert.equal(b.run_1mi, 322);
assert.ok(b.run_5k);
assert.equal(b.run_10k, undefined);
assert.deepEqual(bestsOf({ interval_s: 5, t, dist }, "cycling"), {}, "no run bests on a ride");
const ride = bestsOf({ interval_s: 5, t, power: t.map((s) => (s < 1300 ? 250 : 150)) }, "cycling");
assert.equal(ride.power_20m, 250);

console.log("bests: all passed");
