// Fitness, fatigue and form from training load. Rules, not AI. Pure module (type imports only),
// testable with `node`.
//
// Each session gets a load score where one hour flat out at threshold = 100, from the best data
// it has: power vs FTP (bike), pace vs threshold pace (run), heart rate, or time alone. Then:
//   fitness = 42-day exponentially weighted average of daily load (what training has built)
//   fatigue = 7-day average (how tired recent training should leave you)
//   form    = yesterday's fitness − yesterday's fatigue (positive = fresh, negative = loaded)

import type { Step } from "../workouts/garmin-format.ts";
import { workoutTotals } from "../workouts/totals.ts";
import { strengthLoad, strengthSeconds, type StrengthItem } from "../strength/workout.ts";

export type LoadSource = "power" | "pace" | "hr" | "rpe" | "time";
export type LoadActivity = {
  start_day: string; // athlete's local YYYY-MM-DD
  sport: string | null;
  duration_s: number | null;
  avg_hr: number | null;
  avg_power: number | null;
  normalized_power: number | null;
  avg_speed_mps: number | null;
  training_load?: number | null; // set by Diastole for logged strength sessions (minutes × RPE)
};
export type LoadContext = { ftp: number | null; thresholdSpeed: number | null; thresholdHr: number | null; maxHr: number | null; restingHr: number | null };

const FITNESS_DAYS = 42;
const FATIGUE_DAYS = 7;
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isBike = (s: string | null) => /cycl|bik|ride|spin/i.test(s ?? "");
const isRun = (s: string | null) => /run|treadmill|track|trail/i.test(s ?? "");
const isEndurance = (s: string | null) => isBike(s) || isRun(s) || /swim|row|ski|walk|hik|elliptical/i.test(s ?? "");

/** Heart-rate impulse per minute (Banister), at a given fraction of heart-rate reserve. */
const trimpPerMin = (r: number) => r * 0.64 * Math.exp(1.92 * r);

export function sessionLoad(a: LoadActivity, c: LoadContext): { load: number; source: LoadSource } {
  const hours = (a.duration_s ?? 0) / 3600;
  if (!(hours > 0)) return { load: 0, source: "time" };
  const cap = (v: number) => Math.round(Math.min(v, 450) * 10) / 10;
  if (/strength/i.test(a.sport ?? "") && a.training_load) return { load: cap(Number(a.training_load)), source: "rpe" };

  const power = a.normalized_power ?? a.avg_power;
  if (isBike(a.sport) && power && c.ftp) {
    const f = clamp(power / c.ftp, 0.3, 1.5);
    return { load: cap(hours * f * f * 100), source: "power" };
  }
  if (isRun(a.sport) && a.avg_speed_mps && c.thresholdSpeed) {
    const f = clamp(a.avg_speed_mps / c.thresholdSpeed, 0.3, 1.4);
    return { load: cap(hours * f * f * 100), source: "pace" };
  }
  const rest = c.restingHr ?? 55;
  if (a.avg_hr && c.maxHr && c.maxHr > rest + 20) {
    const r = clamp((a.avg_hr - rest) / (c.maxHr - rest), 0, 1);
    // Threshold heart rate when set, else ~88% of reserve (a typical lactate threshold).
    const thr = c.thresholdHr ? clamp((c.thresholdHr - rest) / (c.maxHr - rest), 0.6, 0.98) : 0.88;
    return { load: cap(((hours * 60 * trimpPerMin(r)) / (60 * trimpPerMin(thr))) * 100), source: "hr" };
  }
  // Time alone: steady endurance ≈ 50 an hour; strength, yoga and the like less.
  return { load: cap(hours * (isEndurance(a.sport) ? 50 : 30)), source: "time" };
}

/** Rough load for a planned workout: easy time at ~70% of threshold, hard time at ~95%. */
export function plannedLoad(steps: Step[], sport: string, strength?: StrengthItem[] | null): number {
  if (sport === "strength") return strengthLoad(strengthSeconds(strength ?? []), 6);
  const t = workoutTotals(steps, sport);
  const hard = t.hardSeconds / 3600;
  const easy = Math.max(0, t.seconds - t.hardSeconds) / 3600;
  return Math.round(easy * 49 + hard * 90);
}

export type LoadDay = { date: string; load: number; fitness: number; fatigue: number; form: number; planned?: boolean };

/**
 * Daily fitness/fatigue/form from `from` to `to`, with planned loads continuing the line past
 * `today` (marked planned). Start `from` well before what's shown (90+ days) so the averages settle.
 */
export function loadSeries(opts: { from: string; to: string; today: string; done: Map<string, number>; planned?: Map<string, number> }): LoadDay[] {
  const kFit = 1 - Math.exp(-1 / FITNESS_DAYS);
  const kFat = 1 - Math.exp(-1 / FATIGUE_DAYS);
  let fitness = 0;
  let fatigue = 0;
  const out: LoadDay[] = [];
  for (let d = opts.from; d <= opts.to; d = addDays(d, 1)) {
    const future = d > opts.today;
    // Today counts what's done plus anything still planned for today.
    const load = (future ? 0 : (opts.done.get(d) ?? 0)) + (d >= opts.today ? (opts.planned?.get(d) ?? 0) : 0);
    const form = fitness - fatigue;
    fitness += (load - fitness) * kFit;
    fatigue += (load - fatigue) * kFat;
    out.push({ date: d, load: Math.round(load), fitness: round1(fitness), fatigue: round1(fatigue), form: round1(form), ...(future ? { planned: true } : {}) });
  }
  return out;
}
const round1 = (v: number) => Math.round(v * 10) / 10;

export type FormBand = { key: "fresh" | "neutral" | "building" | "heavy" | "detraining"; label: string; note: string };

/** What a form number means, in words. */
export function formBand(form: number): FormBand {
  if (form > 15) return { key: "detraining", label: "Very fresh", note: "Rested; fitness slips if this lasts more than a week or so." };
  if (form > 5) return { key: "fresh", label: "Fresh", note: "Ready for a hard session or a race." };
  if (form >= -10) return { key: "neutral", label: "Neutral", note: "Training and recovery in balance." };
  if (form >= -30) return { key: "building", label: "Building", note: "Productive fatigue; fitness is being built." };
  return { key: "heavy", label: "Very fatigued", note: "High risk of overreaching; ease off if readiness is low." };
}

/** Fitness change over the last 7 days (per week). Over ~8 is a fast ramp. */
export function rampRate(series: LoadDay[], today: string): number | null {
  const i = series.findIndex((d) => d.date === today);
  if (i < 7) return null;
  return round1(series[i].fitness - series[i - 7].fitness);
}
