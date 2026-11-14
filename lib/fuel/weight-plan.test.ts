import assert from "node:assert/strict";

import type { Step } from "../workouts/garmin-format.ts";
import {
  LB, addDays, avg7, classify, dayTarget, estimatedBaseline, measuredBaseline, mifflin, pauseCheck, planWeekTargets, plannedEnergy, plannedKg, projection, rateLbWk, weekly,
  type DayInput, type Goal, type PlannedSession, type Week, type Weigh,
} from "./weight-plan.ts";

const kg = (lb: number) => lb * LB;
const goal: Goal = {
  id: "g", height_cm: 175.3, age_years: 26, age_on: "2026-11-14", sex: "male", activity_factor: 1.4,
  start_date: "2026-11-16", start_kg: kg(178), target_kg: kg(165), target_date: "2027-04-04", original_date: "2027-04-04", latest_date: "2027-04-18", maintain_until: "2027-05-08",
  line: [{ date: "2026-11-16", kg: kg(178) }, { date: "2027-01-04", kg: kg(173) }, { date: "2027-03-01", kg: kg(168) }, { date: "2027-04-04", kg: kg(165) }],
  max_rate_lb_wk: 1, easy_deficit: 500, moderate_deficit: 400,
};
const W = kg(178);
const z = { ftp_w: 231, threshold_speed_mps: 4.0 };

// ---- baseline: Mifflin 10·80.74 + 6.25·175.3 − 5·26 + 5 ≈ 1,778; × 1.4 ≈ 2,489
assert.equal(Math.round(mifflin(W, goal, "2026-11-16")), 1778);
assert.equal(estimatedBaseline(W, goal, "2026-11-16"), 2489);
assert.equal(Math.round(mifflin(W, goal, "2027-11-20")), 1773); // a year older

// ---- planned line
assert.equal(Math.round(plannedKg(goal.line, "2027-01-04") / LB), 173);
assert.ok(Math.abs(plannedKg(goal.line, "2026-12-10") / LB - 175.55) < 0.1);
assert.equal(Math.round(plannedKg(goal.line, "2027-05-01") / LB), 165);

// ---- training energy
const t = (seconds: number, low: number, high: number, intensity = "ACTIVE"): Step => ({ kind: "step", intensity: intensity as "ACTIVE", duration: { type: "time", seconds }, target: { type: "power_range", low, high } });
const ride = plannedEnergy("bike", [t(3600, 140, 160)], z, W);
assert.equal(ride.kcal, 540); // 150 W × 3600 s = 540 kJ ≈ kcal
assert.equal(ride.aboveZ2, false);
const run = plannedEnergy("run", [{ kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 1609.344 * 6 } }], z, W);
assert.equal(run.kcal, Math.round(0.75 * 178 * 6)); // 801
const swim = plannedEnergy("swim", [{ kind: "step", intensity: "MAIN", duration: { type: "time", seconds: 3600 }, target: { type: "swim_effort", level: 3 } }], z, W);
assert.equal(swim.kcal, 450);
assert.equal(plannedEnergy("strength", [], z, W, 60).kcal, 250);

// ---- day types and targets
const week: Week = { baseline_kcal: 2489, baseline_source: "estimate", easy_deficit: 500, moderate_deficit: 400, pause_until: null, pause_reason: null, target_date: "2027-04-04" };
const sess = (p: Partial<PlannedSession> & { steps: Step[]; sport: string }, key = false) => {
  const s: PlannedSession = { title: "Endurance", ...p };
  return { ...s, energy: plannedEnergy(s.sport, s.steps, z, W), key };
};
const base = (over: Partial<DayInput>): DayInput => ({ date: "2026-12-02", weightKg: W, goal, week, planned: [], done: [], tomorrowKey: false, goalReached: false, ...over });

const rest = dayTarget(base({}));
assert.equal(rest.type, "rest");
assert.ok(rest.kcal >= 2200 && rest.kcal <= 2215, `rest ${rest.kcal}`); // 2,489 − 500 = 1,989 → floor (grams round to 5)
assert.ok(rest.floored && rest.deficit >= 274 && rest.deficit <= 289);
assert.equal(rest.protein, 155); // 1.9 g/kg
assert.ok(rest.fat >= 0.8 * W - 3);
assert.ok(rest.carbs >= 3 * W - 3);

const easy = dayTarget(base({ planned: [sess({ sport: "bike", steps: [t(3600, 140, 160)] })] }));
assert.equal(easy.type, "easy");
assert.equal(easy.training, 540);
assert.equal(easy.deficit, 500);
assert.ok(Math.abs(easy.kcal - 2529) <= 10, `easy ${easy.kcal}`);

const keyDay = dayTarget(base({ planned: [sess({ sport: "bike", title: "Threshold 3x12", steps: [t(900, 130, 160, "WARMUP"), t(2160, 210, 225, "INTERVAL"), t(900, 120, 140, "COOLDOWN")], plan_meta: { is_key: true, fueling: { carb_g_per_hr: 60 } } }, true)] }));
assert.equal(keyDay.type, "key");
// Ordinary key day: up to 400 kcal off food away from training; carbs never below fueling carbs.
assert.ok(keyDay.deficit > 300 && keyDay.deficit <= 400, `key deficit ${keyDay.deficit}`);
assert.ok(keyDay.carbs >= keyDay.fuelCarbs && keyDay.surplus === 0);
// key_range: the 7 g/kg minimum holds even if it means eating over maintenance.
const strictGoal = { ...goal, carb_floor: "key_range" as const };
const keyStrict = dayTarget({ ...base({ planned: [sess({ sport: "bike", title: "Threshold 3x12", steps: [t(900, 130, 160, "WARMUP"), t(2160, 210, 225, "INTERVAL"), t(900, 120, 140, "COOLDOWN")], plan_meta: { is_key: true, fueling: { carb_g_per_hr: 60 } } }, true)] }), goal: strictGoal });
assert.ok(keyStrict.carbs >= 7 * W - 3 && keyStrict.surplus > 0);
assert.match(keyStrict.reason, /over maintenance/);
assert.ok(keyDay.fuelCarbs >= 60 + 30 + 80); // ~66 min × 60 g/h + pre 30 + recovery 1 g/kg
assert.match(keyDay.reason, /Key session today/);

// Tiers: day before a long session 300, long-session day 300, test day and the day before 0.
const easyRide = () => [sess({ sport: "bike", steps: [t(3600, 140, 160)] })];
const preBig = dayTarget(base({ planned: easyRide(), tomorrowKey: true, tomorrowBig: true }));
assert.ok(Math.abs(preBig.deficit - 300) <= 5, `pre-big ${preBig.deficit}`);
assert.match(preBig.reason, /Long session tomorrow/);
const bigDay = dayTarget(base({ planned: easyRide(), todayBig: true }));
assert.ok(Math.abs(bigDay.deficit - 300) <= 5, `big ${bigDay.deficit}`);
const preTest = dayTarget(base({ planned: easyRide(), tomorrowTest: true, tomorrowBig: true }));
assert.equal(preTest.deficit, 0);
assert.match(preTest.reason, /Test or race-sim tomorrow/);
assert.equal(dayTarget(base({ planned: easyRide(), todayTest: true, todayBig: true })).deficit, 0);

// Fast-loss cut (easy 500 → 300) lowers the other tiers by the same 200.
assert.ok(Math.abs(dayTarget(base({ planned: easyRide(), todayBig: true, week: { ...week, easy_deficit: 300, moderate_deficit: 200 } })).deficit - 100) <= 5);

// Base weight after race day: maintenance, small easy-day deficit only above the band.
const hold = dayTarget(base({ date: "2027-06-01", planned: easyRide() }));
assert.equal(hold.deficit, 0);
assert.match(hold.reason, /Holding your base weight/);
assert.equal(dayTarget(base({ date: "2027-06-01", planned: easyRide(), aboveBand: true })).deficit - 250 <= 5 ? 1 : 0, 1);

// Maintenance block and carb load
assert.equal(dayTarget(base({ date: "2027-04-10" })).deficit, 0);
const load = dayTarget(base({ date: "2027-05-07" }));
assert.equal(load.type, "carb_load");
assert.equal(load.carbs, Math.round((9 * W) / 5) * 5);
assert.equal(classify(base({ date: "2027-05-08" })).type, "race");

// Pause
const paused = dayTarget(base({ week: { ...week, pause_until: "2026-12-05", pause_reason: "readiness red 3 days" }, planned: [sess({ sport: "bike", steps: [t(3600, 140, 160)] })] }));
assert.equal(paused.deficit, 0);
assert.match(paused.reason, /paused/);

// Completed ride replaces the planned one
const doneDay = dayTarget(base({ planned: [sess({ sport: "bike", steps: [t(3600, 140, 160)] })], done: [{ sport: "cycling", duration_s: 3600, distance_m: 30000, avg_power: 170, calories: 700 }] }));
assert.equal(doneDay.training, 612);
assert.equal(doneDay.trainingSource, "done");

// ---- weekly cap: seven easy days want 3,500 → scaled to what the line needs (≤ 2,500)
const easyWeek = Array.from({ length: 7 }, (_, i) => base({ date: addDays("2026-11-30", i), planned: [sess({ sport: "bike", steps: [t(3600, 140, 160)] })] }));
const wk = planWeekTargets(easyWeek);
assert.ok(wk.deficit <= 2500 && wk.deficit >= 2400, `capped week ${wk.deficit}`);
// A key-heavy week falls short and is accepted
const testWeek = Array.from({ length: 7 }, (_, i) => base({ date: addDays("2026-11-30", i), planned: easyRide(), todayTest: i % 2 === 0, tomorrowTest: i % 2 === 1 }));
const kw = planWeekTargets(testWeek);
assert.ok(kw.deficit <= 0 && kw.deficit > -200, `test week ${kw.deficit}`);
assert.equal(kw.short, true);

// ---- weight trend
const series = (from: string, days: number, startLb: number, lbPerWeek: number): Weigh[] => Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), kg: kg(startLb - (lbPerWeek * i) / 7) }));
const w = series("2026-11-16", 42, 178, 0.7);
assert.ok(Math.abs(rateLbWk(w, "2026-12-27")! - 0.7) < 0.01);
assert.equal(avg7([{ date: "2026-11-20", kg: 80 }], "2026-11-20"), null); // needs 3 weigh-ins

// ---- measured baseline: eating 2,600 avg, training 600 avg, losing 0.7 lb/wk → expenditure ≈ 2,600 + 350 = 2,950 → baseline ≈ 2,350
const intake = Array.from({ length: 28 }, (_, i) => ({ date: addDays("2026-11-30", i), kcal: 2600, complete: true, training: 600 }));
const mb = measuredBaseline(intake, series("2026-11-23", 40, 178, 0.7), "2026-12-27", 2489, 2489)!;
assert.ok(Math.abs(mb - 2350) < 30, `measured ${mb}`);
assert.equal(measuredBaseline(intake.slice(0, 10), w, "2026-12-27", 2489, 2489), null);

// ---- guardrails
const wi = (over: Partial<Parameters<typeof weekly>[0]>) =>
  weekly({ today: "2026-12-27", goal, prev: week, weighs: w, ftpByWeek: [231, 240, 245], keyPowerByWeek: [], readiness7: [], hrv7: 80, hrv28: 80, sleepH7: 7.5, sleepScore7: 80, rhr7: 50, rhr28: 50, checkins: [], sick: false, baselineEstimate: 2489, baselineMeasured: null, ...over });
assert.deepEqual(wi({}).guardrails, []);
const fast = wi({ weighs: series("2026-11-16", 42, 180, 1.4) });
assert.equal(fast.guardrails[0].rule, "fast_loss");
assert.equal(fast.easy_deficit, 300);
const stall = wi({ weighs: series("2026-11-16", 42, 178, 0) });
assert.ok(stall.proposeDeficitUp);
assert.equal(stall.easy_deficit, 500); // never raised on its own
const behind = wi({ weighs: series("2026-11-16", 42, 181, 0.2) });
const b = behind.guardrails.find((g) => g.rule === "behind")!;
assert.ok(b && behind.target_date > "2027-04-04" && behind.target_date <= "2027-04-18");
assert.equal(behind.easy_deficit, 500);
const red = wi({ readiness7: ["red", "red", "yellow", "red"] });
assert.equal(red.pause_until, "2027-01-03");
assert.equal(wi({ ftpByWeek: [240, 235, 230] }).guardrails[0].rule, "performance");
const lea = wi({ checkins: [{ week_start: "2026-12-21", fatigue: true, low_libido: true, ill: false, low_mood: false }] });
assert.equal(lea.guardrails[0].rule, "low_energy");
assert.equal(lea.pause_until, "2027-01-10");
assert.equal(pauseCheck({ ftpByWeek: [], keyPowerByWeek: [], readiness7: [], hrv7: 70, hrv28: 80, sleepH7: 7, sleepScore7: 80, rhr7: 50, rhr28: 50, checkins: [], sick: false })!.rule, "recovery");

// ---- projection
assert.equal(projection(goal, w, "2026-12-27", "2027-04-04").onTrack, true);
const slow = projection(goal, series("2026-11-16", 42, 179, 0.3), "2026-12-27", "2027-04-04");
assert.ok(!slow.onTrack && slow.date! > "2027-04-04");

console.log("weight-plan tests passed");
