// Run with: node lib/readiness/engine.test.ts
import assert from "node:assert/strict";

import { activityLoad, computeReadiness, type ActivityLite, type WellnessDay } from "./engine.ts";

function day(i: number) {
  const d = new Date(Date.UTC(2026, 9, 1 + i));
  return d.toISOString().slice(0, 10);
}

// 28 steady days: HRV ~70±3, RHR ~48±1, ~7.5h sleep, stress ~25, BB ~85
function steadyHistory(days = 28): WellnessDay[] {
  return Array.from({ length: days }, (_, i) => ({
    date: day(i),
    hrv_ms: 70 + ((i % 5) - 2) * 1.5,
    resting_hr: 48 + ((i % 3) - 1),
    sleep_seconds: 7.5 * 3600 + ((i % 4) - 2) * 600,
    sleep_score: 80,
    stress_avg: 25 + ((i % 3) - 1) * 2,
    body_battery_high: 85,
  }));
}
// ~45 min easy run every other day
const steadyActs: ActivityLite[] = Array.from({ length: 14 }, (_, i) => ({
  date: day(i * 2),
  duration_s: 45 * 60,
  avg_hr: 140,
  max_hr: 160,
}));

const today = day(28);
let pass = 0;
const check = (name: string, fn: () => void) => {
  fn();
  pass++;
  console.log("PASS ", name);
};

check("normal day is green", () => {
  const r = computeReadiness(today, [...steadyHistory(), { date: today, hrv_ms: 71, resting_hr: 48, sleep_seconds: 7.6 * 3600, sleep_score: 82, stress_avg: 24, body_battery_high: 88 }], steadyActs);
  assert.equal(r.overall, "green");
  assert.equal(r.recovery, "green");
  assert.equal(r.load, "green");
  assert.match(r.note, /Train as planned/);
});

check("suppressed HRV + high RHR is red recovery", () => {
  const r = computeReadiness(today, [...steadyHistory(), { date: today, hrv_ms: 52, resting_hr: 55, sleep_seconds: 7.5 * 3600 }], steadyActs);
  assert.equal(r.recovery, "red");
  assert.equal(r.overall, "red");
  assert.match(r.note, /HRV \d+% below baseline/);
  assert.match(r.note, /easy day or rest/);
});

check("short sleep is red, 5.5h yellow", () => {
  const r1 = computeReadiness(today, [...steadyHistory(), { date: today, sleep_seconds: 4.5 * 3600 }], steadyActs);
  assert.equal(r1.sleep, "red");
  const r2 = computeReadiness(today, [...steadyHistory(), { date: today, sleep_seconds: 5.5 * 3600 }], steadyActs);
  assert.ok(["yellow", "red"].includes(r2.sleep));
});

check("load spike is flagged", () => {
  const spike: ActivityLite[] = [
    ...steadyActs,
    ...Array.from({ length: 6 }, (_, i) => ({ date: day(22 + i), duration_s: 90 * 60, avg_hr: 155, max_hr: 175 })),
  ];
  const r = computeReadiness(today, [...steadyHistory(), { date: today, hrv_ms: 70, resting_hr: 48 }], spike);
  assert.ok(["yellow", "red"].includes(r.load), `load was ${r.load}`);
  assert.match(r.note, /training load \d+% above usual/i);
});

check("new athlete is building baseline", () => {
  const r = computeReadiness(day(3), steadyHistory(3).concat({ date: day(3), hrv_ms: 40, resting_hr: 60 }), []);
  assert.equal(r.recovery, "unknown");
  assert.equal(r.load, "unknown");
  assert.equal(r.overall, "unknown");
  assert.match(r.note, /Building baseline/);
});

check("Apple athlete (no stress/BB/sleep score) still gets recovery + sleep", () => {
  const apple = steadyHistory().map(({ date, hrv_ms, resting_hr, sleep_seconds }) => ({ date, hrv_ms, resting_hr, sleep_seconds }));
  const r = computeReadiness(today, [...apple, { date: today, hrv_ms: 70, resting_hr: 48, sleep_seconds: 7.5 * 3600 }], steadyActs);
  assert.equal(r.stress, "unknown");
  assert.equal(r.recovery, "green");
  assert.equal(r.overall, "green");
});

check("no recovery baseline: a good absolute reading doesn't make the day green", () => {
  const r = computeReadiness(day(0), [{ date: day(0), body_battery_high: 92, stress_avg: 25 }], []);
  assert.equal(r.stress, "green");
  assert.equal(r.overall, "unknown");
  assert.match(r.note, /Building baseline/);
});

check("no recovery baseline: a real warning still shows", () => {
  const r = computeReadiness(day(0), [{ date: day(0), sleep_seconds: 4.5 * 3600 }], []);
  assert.equal(r.overall, "red");
});

check("activity load handles missing HR", () => {
  assert.equal(activityLoad({ date: today, duration_s: 600 }, 50, 190), 5);
  assert.equal(activityLoad({ date: today, duration_s: 0 }, 50, 190), 0);
});

console.log(`\n${pass} passed`);
