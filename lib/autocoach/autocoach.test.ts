import assert from "node:assert/strict";

import { easyVersion } from "./easy.ts";
import { CHECKPOINTS, laneFor, laneText, overallLane, planWeek, projectedAt, raceEstimate } from "./plan.ts";
import { pickRescheduleDate } from "./reschedule-rules.ts";
import { redTrend, swapCandidates, weekCall, type WeekSignals } from "./week-call.ts";

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
assert.equal(Math.round(projectedAt(8).ftp), 293); // plan v2: FTP comes later
assert.equal(Math.round(projectedAt(16).thr), 365);
const race = raceEstimate(projectedAt(25));
assert.ok(race.total > 3 * 3600 + 53 * 60 && race.total < 3 * 3600 + 56 * 60, `race day ≈ 3:54:30, got ${race.total}`);
const cp1 = CHECKPOINTS[0];
assert.equal(laneFor(cp1.metrics[0], 293), "3:55");
assert.equal(laneFor(cp1.metrics[0], 285), "4:05");
assert.equal(laneFor(cp1.metrics[0], 270), "below");
assert.ok(cp1.progressOnly && !CHECKPOINTS[1].progressOnly);
assert.equal(laneText(cp1, "3:55"), "on track for 3:55");
assert.equal(laneText(CHECKPOINTS[1], "4:05"), "4:05 lane");
assert.equal(laneFor(cp1.metrics[1], 372), "3:55"); // TT pace 6:12/mi
assert.equal(laneFor(cp1.metrics[1], 395), "below");
assert.equal(overallLane(["3:55", "4:05", "3:55"]), "4:05");
assert.equal(overallLane([]), null);

// ---- next-week call
const base: WeekSignals = { keyDue: 9, keyDone: 9, red: 0, yellow: 1, hrv7: 60, hrv28: 60, rhr7: 48, rhr28: 48, sleep7: 27000, sleep28: 27000, loadRatio: 1.1, nextWeekType: "build" };
assert.equal(weekCall(base).call, "build");
assert.ok(weekCall(base).asPlanned);
assert.equal(weekCall({ ...base, hrv7: 54, rhr7: 52 }).call, "recover"); // accumulated load on normal sleep
assert.equal(weekCall({ ...base, hrv7: 54, rhr7: 52, sleep7: 22000 }).call, "hold"); // sleep explains it
assert.equal(weekCall({ ...base, hrv7: 54 }).call, "hold");
assert.equal(weekCall({ ...base, red: 3 }).call, "recover");
assert.equal(weekCall({ ...base, red: 2 }).call, "hold");
assert.equal(weekCall({ ...base, keyDone: 5 }).call, "hold");
assert.equal(weekCall({ ...base, hrv28: null, rhr28: null }).call, "build"); // no data, no call
const rec = weekCall({ ...base, red: 3, nextWeekType: "recovery" });
assert.ok(rec.asPlanned && rec.call === "build" && rec.reasons.at(-1)!.includes("recovery week"));
// ---- red trend
assert.equal(redTrend(["red", "yellow", "red"]), true);
assert.equal(redTrend(["green", "yellow", "red"]), false);
// ---- which sessions get lighter
const wk = [
  { id: "tue", date: "2027-01-19", sport: "bike", key: true, category: "threshold" },
  { id: "wed", date: "2027-01-20", sport: "swim", key: true, category: "test", test: true },
  { id: "thu", date: "2027-01-21", sport: "run", key: true, category: "threshold" },
  { id: "sat", date: "2027-01-23", sport: "bike", key: true, category: "long_ride" },
  { id: "easy", date: "2027-01-18", sport: "run", key: false, category: "easy" },
];
assert.deepEqual(swapCandidates(wk, "hold", "2027-01-18").map((c) => c.id), ["tue"]);
assert.deepEqual(swapCandidates(wk, "recover", "2027-01-18", 4).map((c) => c.id), ["tue", "thu"]); // the test stays
assert.deepEqual(swapCandidates(wk, "recover", "2027-01-21").map((c) => c.id), ["thu", "sat"]);

console.log("autocoach tests passed");
