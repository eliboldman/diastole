import assert from "node:assert/strict";
import { repairSteps } from "./repair-distance.ts";

const mi = 1609.344;
const step = (m: number) => ({ kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: m } });
// 6 mi run stored as 9656.06 × 1609.344; a 5 km step stored × 1000; a normal 800 m step untouched.
const r = repairSteps([step(9656.06 * mi), { kind: "repeat", times: 4, steps: [step(5000 * 1000), step(800)] }] as never, "run");
assert.equal(r.fixes.length, 2);
assert.deepEqual(r.fixes.map((f) => [f.to, f.unit, f.sure]), [[9656.06, "mi", true], [5000, "km", true]]);
assert.equal((r.steps as never as { duration: { meters: number } }[])[0].duration.meters, 9656.06);
// Bike 20 mi → fixed; swims untouched.
assert.equal(repairSteps([step(32186.88 * mi)] as never, "bike").fixes[0].to, 32186.88);
assert.equal(repairSteps([step(9656.06 * mi)] as never, "swim").fixes.length, 0);
console.log("repair distances: all passed");
