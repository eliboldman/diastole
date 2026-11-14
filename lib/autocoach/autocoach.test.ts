import assert from "node:assert/strict";

import { easyVersion } from "./easy.ts";
import { CHECKPOINTS, laneFor, overallLane, planWeek, projectedAt, raceEstimate } from "./plan.ts";
import { pickRescheduleDate } from "./reschedule-rules.ts";

// ---- easy version: same time, Z1–Z2 power for bikes (never HR), pace for runs, effort for swims
const z = { ftp_w: 300, threshold_speed_mps: 4.0 };
const bike = easyVersion(
  {
    sport: "bike",
    title: "Threshold 2x20",
    steps: [
      { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 900 } },
      { kind: "repeat", times: 2, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 1200 }, target: { type: "power_range", low: 285, high: 300 } }, { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 300 } }] },
      { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 } },
    ],
    brick: { sport: "run", steps: [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 900 } }] },
  },
  z,
)!;
const secs = (ss: { kind: string; duration?: { type: string; seconds?: number } }[]) => ss.reduce((a, s) => a + (s.duration?.type === "time" ? s.duration.seconds! : 0), 0);
assert.equal(secs(bike.steps as never), 15 * 60 + 2 * 25 * 60 + 10 * 60); // 75 min kept
assert.equal(bike.title, "Easy: Threshold 2x20");
for (const s of bike.steps) assert.equal(s.kind === "step" && s.target?.type, "power_range");
const main = bike.steps[1];
assert.ok(main.kind === "step" && main.target?.type === "power_range" && main.target.high <= 0.7 * 300);
assert.equal(secs(bike.brick!.steps as never), 900);
assert.ok(bike.summary.includes("75 min") && bike.summary.includes("15 min easy run"));

const run = easyVersion({ sport: "run", title: "5K pace 6x1 km", steps: [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 50 * 60 } }] }, z)!;
const rm = run.steps[1];
assert.ok(rm.kind === "step" && rm.target?.type === "pace_range" && rm.target.fastSecPerKm > 1000 / 4.0); // slower than threshold

const swim = easyVersion({ sport: "swim", title: "CSS 8x100", steps: [{ kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 2286 } }], pool_length: 25, pool_unit: "YARD" }, z)!;
for (const s of swim.steps) assert.ok(s.kind === "step" && s.target?.type === "swim_effort" && s.target.level <= 3);
const swimM = swim.steps.reduce((a, s) => a + (s.kind === "step" && s.duration.type === "distance" ? s.duration.meters : 0), 0);
assert.ok(Math.abs(swimM - 2286) < 25); // whole lengths, about the same distance
assert.equal(easyVersion({ sport: "strength", title: "Strength", steps: [] }, z), null);

// ---- reschedule: next fitting day within 3, no key days back to back, no Fri/Sat swims, not race week
const today = "2026-12-02"; // Wednesday
assert.equal(pickRescheduleDate({ sport: "run" }, [], today, "2027-05-08"), "2026-12-03");
// Thursday has a key ride → Thu, and Fri (next to Thu) are out; Sat is free.
assert.equal(pickRescheduleDate({ sport: "run" }, [{ date: "2026-12-03", sport: "bike", key: true }], today, "2027-05-08"), "2026-12-05");
// A swim can't go Fri/Sat: Thu key → Fri/Sat skipped (swim) and Thu/Fri blocked → none.
assert.equal(pickRescheduleDate({ sport: "swim" }, [{ date: "2026-12-03", sport: "bike", key: true }], today, "2027-05-08"), null);
// Same sport already that day → skip it.
assert.equal(pickRescheduleDate({ sport: "run" }, [{ date: "2026-12-03", sport: "run", key: false }], today, "2027-05-08"), "2026-12-04");
// Race week: nothing.
assert.equal(pickRescheduleDate({ sport: "run" }, [], "2027-05-01", "2027-05-08"), null);

// ---- plan weeks, projection, lanes
assert.equal(planWeek("2026-11-13"), 0);
assert.equal(planWeek("2026-11-16"), 1);
assert.equal(planWeek("2026-11-23"), 2);
assert.equal(planWeek("2027-05-08"), 25);
assert.equal(Math.round(projectedAt(8).ftp), 300);
assert.equal(Math.round(projectedAt(16).thr), 365);
const race = raceEstimate(projectedAt(25));
assert.ok(race.total > 3 * 3600 + 53 * 60 && race.total < 3 * 3600 + 56 * 60, `race day ≈ 3:54:30, got ${race.total}`);
const cp1 = CHECKPOINTS[0];
assert.equal(laneFor(cp1.metrics[0], 305), "3:55");
assert.equal(laneFor(cp1.metrics[0], 290), "4:05");
assert.equal(laneFor(cp1.metrics[0], 270), "below");
assert.equal(laneFor(cp1.metrics[1], 372), "3:55"); // TT pace 6:12/mi
assert.equal(laneFor(cp1.metrics[1], 395), "below");
assert.equal(overallLane(["3:55", "4:05", "3:55"]), "4:05");
assert.equal(overallLane([]), null);

console.log("autocoach tests passed");
