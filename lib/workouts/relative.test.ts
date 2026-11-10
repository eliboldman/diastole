import assert from "node:assert/strict";
import { annotate, hasRelative, relText, resolve, stripRel } from "./relative.ts";
import { describe } from "./describe.ts";

// Loose access into nested test steps.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const eli = { ftp_w: 250, threshold_speed_mps: 4, threshold_hr: 170, max_hr: 190 };
const walker = { ftp_w: 300, threshold_speed_mps: 4.5, threshold_hr: null, max_hr: 200 };

const steps = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 } },
  { kind: "repeat", times: 4, steps: [
    { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 480 }, target: { type: "power_range", low: 225, high: 238 } },
    { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 }, target: { type: "hr_range", low: 120, high: 136 } },
  ] },
] as never;

const a = annotate(steps, eli);
assert.ok(hasRelative(a));
const iv = (a as Any)[1].steps[0].target;
assert.deepEqual(iv.rel, { pct: [90, 95.2] });
assert.equal(relText(iv), "90–95% FTP");
assert.deepEqual((a as Any)[1].steps[1].target.rel, { pct: [70.6, 80], of: "thr" });

// Walker: 90–95.2% of 300 W; HR threshold missing → falls back to 90% of max (180).
const w = resolve(a, walker);
assert.equal(w.changed, true);
assert.deepEqual((w.steps as Any)[1].steps[0].target, { type: "power_range", low: 270, high: 286, rel: { pct: [90, 95.2] } });
assert.deepEqual([(w.steps as Any)[1].steps[1].target.low, (w.steps as Any)[1].steps[1].target.high], [127, 144]);
assert.deepEqual(w.missing, []);

// No FTP: written numbers stay, FTP reported missing.
const none = resolve(a, { ftp_w: null, threshold_speed_mps: null, threshold_hr: 170, max_hr: null });
assert.deepEqual((none.steps as Any)[1].steps[0].target.low, 225);
assert.deepEqual(none.missing, ["FTP"]);

// Pace: 6:00/km–5:50/km at threshold 4 m/s (4:10/km) → same % at 4.5 m/s.
const pace = annotate([{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 600 }, target: { type: "pace_range", slowSecPerKm: 260, fastSecPerKm: 250 } }] as never, eli);
const p = (resolve(pace, walker).steps as Any)[0].target;
assert.equal(p.fastSecPerKm, Math.round(250 * 4 / 4.5));
assert.equal(p.slowSecPerKm, Math.round(260 * 4 / 4.5));

// Library text shows the %; strip removes it.
assert.ok(describe(a, "mi", null, false, true).some((l) => l.includes("90–95% FTP")));
assert.equal(hasRelative(stripRel(a)), false);
console.log("relative targets: all passed");
