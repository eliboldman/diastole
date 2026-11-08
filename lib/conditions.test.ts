import assert from "node:assert/strict";

import { adjustForConditions, conditionsFor, conditionsNote } from "./conditions.ts";

assert.equal(conditionsFor(12, 300).total, 0);
const c = conditionsFor(29, 1500); // 7% heat + 2% altitude
assert.ok(Math.abs(c.heat - 0.07) < 1e-9 && Math.abs(c.altitude - 0.02) < 1e-9);
assert.ok(Math.abs(conditionsFor(40, 4000).total - 0.12) < 1e-9, "capped");
const steps = adjustForConditions([{ kind: "repeat", times: 2, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 60 }, target: { type: "pace_range", fastSecPerKm: 240, slowSecPerKm: 250 } }] }], 0.05);
const inner = steps[0].kind === "repeat" ? steps[0].steps[0] : null;
assert.ok(inner?.kind === "step" && inner.target?.type === "pace_range" && inner.target.fastSecPerKm === 252);
assert.match(conditionsNote(c, "mi", "run"), /Paces about 9% slower for heat \(feels like 84°F\) and altitude \(4,922 ft\)/);
console.log("conditions: all passed");
