import assert from "node:assert/strict";

import type { Step } from "./garmin-format.ts";
import { isKey, planLife, shortenTo, totalSeconds } from "./life.ts";

const t = (seconds: number, intensity = "ACTIVE"): Step => ({ kind: "step", intensity: intensity as "ACTIVE", duration: { type: "time", seconds } });
const easy: Step[] = [t(600, "WARMUP"), t(2400), t(600, "COOLDOWN")]; // 60 min
const intervals: Step[] = [t(900, "WARMUP"), { kind: "repeat", times: 6, steps: [t(180, "INTERVAL"), t(120, "RECOVERY")] }, t(600, "COOLDOWN")]; // 55 min

assert.equal(totalSeconds(easy), 3600);
assert.equal(totalSeconds([{ kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 5000 } }]), null);

const short = shortenTo(intervals, 40 * 60);
assert.ok(totalSeconds(short)! <= 40 * 60 + 60, `fits: ${totalSeconds(short)}`);
assert.ok(short[1].kind === "repeat" && short[1].times < 6, "fewer reps");

const W = (steps: Step[], title = "Easy run") => ({ title, sport: "run" as const, steps, scheduled_date: "2026-11-09" });
// 45 of 60 minutes = 75%: applies on its own.
const p1 = planLife({ reason: "minutes", workout: W(easy), minutes: 45 });
assert.equal(p1.auto, true);
assert.ok(p1.proposal?.action === "steps");
// 20 of 60: goes to the coach.
assert.equal(planLife({ reason: "minutes", workout: W(easy), minutes: 20 }).auto, false);
assert.equal(planLife({ reason: "minutes", workout: W(easy), minutes: 90 }).proposal, null, "already fits");

assert.equal(planLife({ reason: "feeling_off", workout: W(intervals, "6 x 3 min"), readiness: "green" }).auto, true);
assert.equal(planLife({ reason: "feeling_off", workout: W(intervals, "6 x 3 min"), readiness: "red" }).proposal?.action, "skip");

assert.equal(isKey(W(intervals, "6 x 3 min")), true);
assert.equal(isKey(W(easy)), false);
const miss = planLife({ reason: "missed", workout: W(intervals, "6 x 3 min"), freeDays: ["2026-11-11"] });
assert.equal(miss.auto, false);
assert.deepEqual(miss.proposal, { action: "move", date: "2026-11-11" });
assert.equal(planLife({ reason: "cant_today", workout: W(easy) }).auto, true, "easy sessions just go");
console.log("life happened: all passed");

import { buildRamp } from "./life.ts";
const ramp = buildRamp({ daysOff: 6, sport: "run", start: "2026-11-10" });
assert.equal(ramp[0].date, "2026-11-10");
assert.equal(ramp.length, 5);
assert.ok(ramp.every((w, i) => i === 0 || totalSeconds(w.steps)! >= totalSeconds(ramp[i - 1].steps)!), "never steps down");
assert.equal(buildRamp({ daysOff: 2, sport: "bike", start: "2026-11-10" })[0].title, "Easy 20 min ride (easing back)");
console.log("return ramp: all passed");
