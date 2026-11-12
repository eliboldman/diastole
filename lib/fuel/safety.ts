// Phase 9c: the coach's private safety net. Rules, not AI. Flags an athlete who seems to be
// eating well under their targets while training hard or recovering poorly. Never shown to athletes.
//
// The hard part is not crying wolf when someone just doesn't log. So:
//  - only "fully logged" days count: 3+ entries, 2+ different meals, something after 4 pm;
//    days with partial or no logging are ignored completely (never read as low intake);
//  - it needs 4+ fully logged days in the last 7, and low intake on most of them;
//  - and low intake alone isn't enough: high training load or poor recovery must show up too.
// Pure module (type imports only) so it can be tested directly with `node`.

import { dailyTargets, slotFor, type PerKg } from "./meals.ts";
import type { FuelDay } from "./plan.ts";

export type SafetyDay = { date: string; level: FuelDay; meals: { hour: number; kcal: number; carbs: number }[] };
export type SafetyInput = {
  weightKg: number | null;
  perKg?: PerKg | null; // the athlete's own goals, when a dietitian or coach set them
  days: SafetyDay[]; // the last 7 finished days (not today)
  load: { last7Hours: number; prior28Hours: number };
  readiness: string[]; // overall flag for each of the last 7 days that has one
  feels: number[]; // check-in feel (1-5) of the most recent workouts, newest first, last 14 days
};

export type Signals = {
  intake: { completeDays: number; lowDays: number; pctOfTarget: number };
  load: { pctAboveUsual: number } | null;
  recovery: { yellowRedDays: number; badFeels: number } | null;
};
export type SafetyResult = { signals: Signals; count: number; summary: string };

export const RULES = {
  minEntries: 3,
  minSlots: 2,
  lateHour: 16,
  minCompleteDays: 4,
  minLowDays: 3,
  lowShare: 0.6,
  lowFraction: 0.75, // below 75% of the bottom of the day's kcal or carb range
  loadUp: 1.2, // last week 20%+ above the 4-week average
  minPriorHours: 2, // need some training history to compare against
  yellowRedDays: 3,
  badFeel: 2,
  badFeels: 2,
} as const;

/** A day the athlete seems to have logged in full. Partial days don't count either way. */
export function isCompleteDay(meals: SafetyDay["meals"]): boolean {
  if (meals.length < RULES.minEntries) return false;
  const slots = new Set(meals.map((m) => slotFor(m.hour)));
  return slots.size >= RULES.minSlots && meals.some((m) => m.hour >= RULES.lateHour);
}

export function evaluateSafety(input: SafetyInput): SafetyResult | null {
  if (!input.weightKg) return null; // no targets to compare against

  // 1. Intake, from fully logged days only.
  let complete = 0;
  let low = 0;
  const pcts: number[] = [];
  for (const d of input.days) {
    if (!isCompleteDay(d.meals)) continue;
    const t = dailyTargets(input.weightKg, d.level, input.perKg);
    if (!t) continue;
    complete += 1;
    const kcal = d.meals.reduce((s, m) => s + m.kcal, 0);
    const carbs = d.meals.reduce((s, m) => s + m.carbs, 0);
    pcts.push(kcal / t.kcal.low);
    if (kcal < t.kcal.low * RULES.lowFraction || carbs < t.carbs.low * RULES.lowFraction) low += 1;
  }
  const intakeLow = complete >= RULES.minCompleteDays && low >= RULES.minLowDays && low / complete >= RULES.lowShare;
  if (!intakeLow) return null;
  const pctOfTarget = Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100);

  // 2. Training load against their own usual week.
  const usual = input.load.prior28Hours / 4;
  const load =
    input.load.prior28Hours >= RULES.minPriorHours && input.load.last7Hours >= usual * RULES.loadUp
      ? { pctAboveUsual: Math.round((input.load.last7Hours / usual - 1) * 100) }
      : null;

  // 3. Recovery: readiness, or how recent workouts felt.
  const yellowRedDays = input.readiness.filter((f) => f === "yellow" || f === "red").length;
  const badFeels = input.feels.slice(0, 4).filter((f) => f <= RULES.badFeel).length;
  const recovery = yellowRedDays >= RULES.yellowRedDays || badFeels >= RULES.badFeels ? { yellowRedDays, badFeels } : null;

  if (!load && !recovery) return null;

  const signals: Signals = { intake: { completeDays: complete, lowDays: low, pctOfTarget }, load, recovery };
  const parts = [`Logged intake about ${pctOfTarget}% of target, low on ${low} of ${complete} fully logged days`];
  if (load) parts.push(`training up ${load.pctAboveUsual}% vs their usual week`);
  if (recovery && yellowRedDays >= RULES.yellowRedDays) parts.push(`readiness yellow or red ${yellowRedDays} of the last 7 days`);
  if (recovery && badFeels >= RULES.badFeels) parts.push(`${badFeels} of their last 4 workouts felt bad`);
  return { signals, count: 1 + (load ? 1 : 0) + (recovery ? 1 : 0), summary: parts.join(" · ") };
}

/**
 * After the coach dismisses a note, stay quiet for 14 days unless it clearly gets worse
 * (another signal joins, or 2+ more low days).
 */
export function shouldNotifyAgain(prev: { count: number; lowDays: number; decidedDaysAgo: number } | null, next: SafetyResult): boolean {
  if (!prev) return true;
  if (prev.decidedDaysAgo >= 14) return true;
  return next.count > prev.count || next.signals.intake.lowDays >= prev.lowDays + 2;
}
