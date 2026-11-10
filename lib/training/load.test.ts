import assert from "node:assert/strict";
import { formBand, loadSeries, plannedLoad, rampRate, sessionLoad } from "./load.ts";

const ctx = { ftp: 250, thresholdSpeed: 4, thresholdHr: 170, maxHr: 190, restingHr: 50 };
const base = { start_day: "2026-11-10", avg_hr: null, avg_power: null, normalized_power: null, avg_speed_mps: null };

// One hour at FTP = 100.
assert.deepEqual(sessionLoad({ ...base, sport: "cycling", duration_s: 3600, normalized_power: 250 }, ctx), { load: 100, source: "power" });
// One hour at threshold pace = 100; at 80% pace = 64.
assert.equal(sessionLoad({ ...base, sport: "running", duration_s: 3600, avg_speed_mps: 4 }, ctx).load, 100);
assert.equal(sessionLoad({ ...base, sport: "running", duration_s: 3600, avg_speed_mps: 3.2 }, ctx).load, 64);
// Heart rate at threshold for an hour ≈ 100; easier HR scores less.
const hr = sessionLoad({ ...base, sport: "lap_swimming", duration_s: 3600, avg_hr: 170 }, ctx);
assert.equal(hr.source, "hr");
assert.ok(Math.abs(hr.load - 100) < 1);
assert.ok(sessionLoad({ ...base, sport: "lap_swimming", duration_s: 3600, avg_hr: 130 }, ctx).load < 50);
// Nothing measured: time only.
assert.deepEqual(sessionLoad({ ...base, sport: "strength_training", duration_s: 3600 }, { ...ctx, maxHr: null }), { load: 30, source: "time" });

// Steady 50/day for 120 days: fitness and fatigue converge near 50, form near 0.
const done = new Map<string, number>();
let d = "2026-07-01";
const days: string[] = [];
for (let i = 0; i < 132; i++) {
  days.push(d);
  done.set(d, 50);
  d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
const s = loadSeries({ from: days[0], to: days[131], today: days[131], done });
const last = s[s.length - 1];
assert.ok(last.fitness > 45 && last.fitness <= 50, `fitness ${last.fitness}`);
assert.ok(last.fatigue > 49.9);
assert.ok(Math.abs(last.form) < 5);
assert.ok((rampRate(s, days[131]) ?? 99) < 1);
// A big block raises fatigue faster than fitness → form goes negative.
for (const x of days.slice(-7)) done.set(x, 150);
const t = loadSeries({ from: days[0], to: days[131], today: days[131], done }).at(-1)!;
assert.ok(t.form < -30, `form ${t.form}`);
assert.equal(formBand(t.form).key, "heavy");
// A milder block (85/day for a week) is productive fatigue.
for (const x of days.slice(-7)) done.set(x, 85);
const m = loadSeries({ from: days[0], to: days[131], today: days[131], done }).at(-1)!;
assert.equal(formBand(m.form).key, "building", `form ${m.form}`);
assert.equal(formBand(20).key, "detraining");
// Planned days ahead are marked and carry load.
const future = loadSeries({ from: days[0], to: "2026-11-15", today: days[131], done, planned: new Map([["2026-11-12", 80]]) });
assert.ok(future.find((x) => x.date === "2026-11-12")?.planned);
assert.equal(future.find((x) => x.date === "2026-11-12")?.load, 80);
// 45 min easy run ≈ 37.
assert.equal(plannedLoad([{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2700 } }] as never, "run"), 37);
console.log("training load: all passed");
