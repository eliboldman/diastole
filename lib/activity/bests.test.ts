// Run: npm run test:bests
import assert from "node:assert/strict";

import { bestAverage, bestsOf, cleanDistance, fastestOver } from "./bests.ts";

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

// GPS catch-up: a 30 s gap then the distance jumps 600 m in one step. No fake fast mile.
{
  const t2: number[] = [];
  const d2: number[] = [];
  let dd = 0;
  for (let x = 0; x <= 2400; x += 5) {
    t2.push(x);
    if (x === 1200) dd += 600; // the glitch
    dd += 3 * 5; // 3 m/s steady
    d2.push(dd);
  }
  const g = bestsOf({ interval_s: 5, t: t2, dist: d2, speed: t2.map(() => 3) }, "running");
  assert.ok(!g.run_1mi || g.run_1mi >= 520, `mile ${g.run_1mi} should be ~536 s (3 m/s), not glitch-fast`);
  assert.equal(cleanDistance([0, 5, 10], [0, 1000, 1015], [3, 3, 3])[1], 15, "a 1 km jump in 5 s becomes 5 s at 3 m/s");
  assert.deepEqual(cleanDistance([0, 5, 10], [100, 20, 35]), [0, 0, 15], "a reset counts as no distance");
}

// A pause right before the distance is reached must not shave time off (was: 23:20 read as 17:57).
{
  // 3 m/s for 500 s (1500 m), then 200 s with the watch nearly still, then 3 m/s again.
  const t3: number[] = [];
  const d3: number[] = [];
  let x3 = 0;
  for (let s3 = 0; s3 <= 1400; s3 += 5) {
    t3.push(s3);
    d3.push(x3);
    x3 += s3 >= 500 && s3 < 700 ? 0.05 : 15;
  }
  const one = fastestOver(t3, d3, 1609.344)!;
  assert.ok(one >= 536, `mile ${one} can't beat 3 m/s (536 s)`);
}

console.log("bests: all passed");
