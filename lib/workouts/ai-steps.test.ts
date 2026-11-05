// Run: npm run test:aisteps
import assert from "node:assert/strict";

import { clockToSec, leafToStep, toMeters, type AiLeaf } from "./ai-steps.ts";

const base: AiLeaf = {
  kind: "step", intensity: "INTERVAL", duration_type: "distance", seconds: null, distance: 800, distance_unit: "m",
  target_type: "none", hr_zone: null, low: null, high: null, pace_fast: null, pace_slow: null,
  swim_effort: null, swim_pace_per_100: null, stroke: null, drill: null, equipment: null, note: null,
};

assert.equal(clockToSec("7:30"), 450);
assert.equal(clockToSec("bad"), null);
assert.equal(toMeters(1, "mi", null), 1609.34);
assert.equal(toMeters(100, null, { length: 25, unit: "YARD" }), 91.44, "pool unit is the default for swims");

// 800 m at 6:00-6:10 per mile -> sec per km, fastest first, whatever order Claude gave.
const run = leafToStep({ ...base, target_type: "pace_range", pace_fast: "6:10", pace_slow: "6:00" }, { paceUnit: "mi", ftp: null, pool: null });
assert.equal(run.kind === "step" && run.duration.type === "distance" && run.duration.meters, 800);
assert.deepEqual(run.kind === "step" && run.target, { type: "pace_range", fastSecPerKm: 224, slowSecPerKm: 230 });

// 90-95% FTP on a 250 W FTP.
const bike = leafToStep({ ...base, duration_type: "time", seconds: 480, distance: null, target_type: "power_pct_ftp", low: 90, high: 95 }, { paceUnit: "mi", ftp: 250, pool: null });
assert.deepEqual(bike.kind === "step" && bike.target, { type: "power_range", low: 225, high: 238 });
// No FTP known: no target rather than a wrong one.
const noFtp = leafToStep({ ...base, target_type: "power_pct_ftp", low: 90, high: 95 }, { paceUnit: "mi", ftp: null, pool: null });
assert.equal(noFtp.kind === "step" && noFtp.target, undefined);

// Swim: 100 yd free at 1:30/100, then a send-off rest.
const swim = leafToStep({ ...base, distance: 100, distance_unit: "yd", target_type: "swim_pace", swim_pace_per_100: "1:30", stroke: "FREESTYLE" }, { paceUnit: "mi", ftp: null, pool: { length: 25, unit: "YARD" } });
assert.equal(swim.kind === "step" && swim.duration.type === "distance" && swim.duration.meters, 91.44);
assert.deepEqual(swim.kind === "step" && [swim.target, swim.stroke], [{ type: "swim_pace", secPer100: 90 }, "FREESTYLE"]);
const rest = leafToStep({ ...base, intensity: "REST", duration_type: "sendoff", seconds: 105, distance: null }, { paceUnit: "mi", ftp: null, pool: { length: 25, unit: "YARD" } });
assert.deepEqual(rest.kind === "step" && rest.duration, { type: "sendoff", seconds: 105 });

console.log("ai-steps: all passed");
