// Run with: node lib/activity/form.test.ts
import assert from "node:assert/strict";

import type { Streams } from "./fit.ts";
import { baselineOf, detectPatterns, drift, judge, summarizeForm, worseBy, type FormRun, type FormSummary } from "./form.ts";

// A 30-minute run (5 s samples) whose ground contact time creeps up late, with a stop in the middle.
const N = 360;
const streams: Streams = {
  interval_s: 5,
  t: Array.from({ length: N }, (_, i) => i * 5),
  speed: Array.from({ length: N }, (_, i) => (i >= 170 && i < 180 ? 0 : 3.2)),
  cadence: Array.from({ length: N }, () => 172),
  gct: Array.from({ length: N }, (_, i) => (i < 240 ? 250 : 270)),
  vo: Array.from({ length: N }, () => 92),
  hr: Array.from({ length: N }, () => 150),
};

const f = summarizeForm(streams, "running")!;
assert.ok(f, "running with dynamics gives a summary");
assert.equal(f.moving_s, (N - 10) * 5, "standing still is excluded");
assert.deepEqual(Object.keys(f.metrics), ["cadence", "gct", "vo"], "only recorded metrics, in display order");
assert.equal(f.metrics.cadence!.avg, 172);
assert.equal(f.metrics.gct!.first, 250);
assert.equal(f.metrics.gct!.last, 270);
assert.equal(summarizeForm(streams, "walking"), null, "walks aren't judged for running form");
assert.equal(summarizeForm({ interval_s: 5, t: [0, 5, 10], hr: [1, 2, 3] }, "running"), null, "no form data, no summary");

// Drift: GCT up 8% late = worse; cadence flat = fine
assert.equal(drift("gct", f.metrics.gct!).drifted, true);
assert.match(drift("gct", f.metrics.gct!).text, /\+8%/);
assert.equal(drift("cadence", f.metrics.cadence!).drifted, false);

// Direction: higher GCT is worse, lower cadence is worse, balance is distance from 50
assert.ok(worseBy("gct", 250, 270) > 0);
assert.ok(worseBy("cadence", 172, 165) > 0);
assert.ok(Math.abs(worseBy("gct_bal", 50.2, 51.2) - 1.0) < 1e-9);

// Judgement: reference and baseline
assert.equal(judge("gct", 260, null).status, "green");
assert.equal(judge("gct", 300, null).status, "yellow");
assert.equal(judge("gct", 320, null).status, "red");
assert.equal(judge("gct", 265, 250).status, "yellow", "in range but 6% above usual");
assert.equal(judge("gct", 270, 250).status, "red", "8% above usual");
assert.match(judge("gct", 265, 250).line, /6% higher than usual \(250 ms\)/);
assert.equal(judge("cadence", 175, 176).status, "green");
assert.match(judge("cadence", 175, 176).line, /In line with usual/);
assert.equal(judge("stride", 1.1, null).status, null, "stride has no general range");
assert.match(judge("gct_bal", 51.8, null).line, /1\.8% off even/);
assert.equal(baselineOf([1, 2, 3, 4]), null, "needs 5 runs");
assert.equal(baselineOf([5, 1, 3, 2, 4]), 3);

// Patterns: 3 of the last 5 runs with long GCT -> one "level" pattern; drift in 3 -> "fatigue"
const run = (date: string, gct: number, last = gct): FormRun => ({
  date,
  form: { v: 1, moving_s: 1800, metrics: { gct: { avg: gct, first: gct, last, n: 300 }, cadence: { avg: 172, first: 172, last: 172, n: 300 } } } as FormSummary,
});
const history: FormRun[] = [run("11-04", 300, 330), run("11-02", 305, 335), run("10-31", 260), run("10-29", 302, 330), run("10-27", 262)];
const p = detectPatterns(history);
assert.deepEqual(p.map((x) => x.key).sort(), ["gct:fatigue", "gct:level"]);
assert.equal(p.find((x) => x.key === "gct:level")!.runs, 3);
assert.deepEqual(detectPatterns(history.slice(0, 2)), [], "too few runs");

// Pace guard: a big late change with a big pace change isn't fatigue
assert.ok(f.pace && Math.abs(f.pace.first - 3.2) < 1e-9, "pace per third recorded");
assert.equal(drift("gct", { avg: 260, first: 250, last: 270, n: 100 }, { first: 3.0, last: 3.6 }).drifted, false);
assert.equal(drift("gct", { avg: 260, first: 250, last: 270, n: 100 }, { first: 3.0, last: 3.05 }).drifted, true);
assert.equal(drift("power", { avg: 300, first: 340, last: 210, n: 100 }).drifted, false, "power drift is never judged");

assert.match(judge("power", 377, 380).line, /isn't judged/);
assert.equal(judge("power", 377, 380).status, null);

console.log("form: all passed");
