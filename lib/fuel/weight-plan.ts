// Race-weight goal (Eli, 2026-11-14): daily calorie and macro targets from a weight goal, the day's
// training, and weekly guardrails. Rules only, no AI. Training-nutrition guidance, not medical advice.
//
//   daily target = baseline (resting metabolism × activity, or measured from weight trend + intake)
//                + the day's training energy (completed when synced, else planned)
//                − the day's deficit (tiered by day; the week aims at what the planned line needs)
//
// Deficit tiers (2026-11-14 revision: Eli chose to cut on schedule and hold the target as his base weight):
//   rest/easy 500 · moderate 400 · ordinary key session 400 · day before a long/brick session 300 ·
//   long ride/run or brick day 300 · test or race-sim day, and the day before one, 0 · race week 0.
// In-session/pre/recovery carbs are never cut, protein never drops, the 2,200 kcal floor holds, and
// guardrails only ever shrink or pause the deficit on their own. After race day the target weight is held:
// maintenance, with a small easy-day deficit only if the 7-day average drifts above the band.
// The one rule that would grow the deficit (stalled 3 weeks) is a proposal the athlete approves.
// Pure module (type imports only) so it can be tested directly with `node`.

import type { Step, Target } from "../workouts/garmin-format.ts";

export const LB = 0.45359237;
export const KCAL_PER_KG = 7700; // ≈ 3,500 kcal per lb of body fat
export const FLOOR_KCAL = 2200; // never recommend less during this training load
export const WEEK_DEFICIT_MAX = 2500; // ≈ 0.7 lb/week
export const WEEK_DEFICIT_MIN = 2000; // aim at least this while cutting, even where the line is flatter
export const HOLD_DEFICIT = 250; // easy/rest days only, after race day, when above the hold band
export const EASY_DEFICIT_CAP = 600;

const r10 = (n: number) => Math.round(n / 10) * 10;
const r5 = (n: number) => Math.round(n / 5) * 5;
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

// ---------------------------------------------------------------- goal and baseline

export type LinePoint = { date: string; kg: number };
export type Goal = {
  id: string;
  height_cm: number;
  age_years: number;
  age_on: string;
  sex: "male" | "female";
  activity_factor: number;
  start_date: string;
  start_kg: number;
  target_kg: number;
  target_date: string; // may slide later (≤ latest_date)
  original_date: string;
  latest_date: string;
  maintain_until: string; // race day
  line: LinePoint[];
  max_rate_lb_wk: number;
  easy_deficit: number;
  moderate_deficit: number;
  /**
   * How hard the per-kg carb ranges bind when calories are tight:
   *   fuel      = calories rule; carbs get as close to the day's range as calories allow, never below
   *               in-session + pre + recovery carbs or 3 g/kg
   *   key_range = like fuel, but key/race days always get their full range minimum (may exceed maintenance)
   *   range     = every day gets its range minimum (deficits shrink, key days can exceed maintenance)
   */
  carb_floor?: "fuel" | "key_range" | "range";
  /** Ordinary key-session days, only from food away from training. Default 400. */
  key_deficit?: number;
  /** The day before a long ride/run or brick. Default 300. */
  pre_big_deficit?: number;
  /** Long ride/run or brick days. Default 300. Test and race-sim days (and the day before) are always 0. */
  big_deficit?: number;
  /** After race day: hold the target; above target + this many lb (7-day average), easy days get a small deficit. Default 2. */
  hold_band_lb?: number;
};

export const ageOn = (g: Pick<Goal, "age_years" | "age_on">, date: string) => g.age_years + Math.floor(daysBetween(g.age_on, date) / 365.25);

/** Mifflin-St Jeor resting metabolism, kcal/day. */
export function mifflin(kg: number, g: Pick<Goal, "height_cm" | "age_years" | "age_on" | "sex">, date: string): number {
  return 10 * kg + 6.25 * g.height_cm - 5 * ageOn(g, date) + (g.sex === "male" ? 5 : -161);
}

/** Resting metabolism × the non-training activity factor. */
export const estimatedBaseline = (kg: number, g: Goal, date: string) => Math.round(mifflin(kg, g, date) * g.activity_factor);

/** The planned 7-day-average weight on `date` (linear between line points, flat outside them). */
export function plannedKg(line: LinePoint[], date: string): number {
  const pts = [...line].sort((a, b) => a.date.localeCompare(b.date));
  if (date <= pts[0].date) return pts[0].kg;
  for (let i = 1; i < pts.length; i++) {
    if (date <= pts[i].date) {
      const a = pts[i - 1];
      const b = pts[i];
      return a.kg + ((b.kg - a.kg) * daysBetween(a.date, date)) / daysBetween(a.date, b.date);
    }
  }
  return pts[pts.length - 1].kg;
}

/** The planned line with its final point moved to a later date (the behind-the-line guardrail). */
export function shiftedLine(line: LinePoint[], newTargetDate: string): LinePoint[] {
  const pts = [...line].sort((a, b) => a.date.localeCompare(b.date));
  const last = pts[pts.length - 1];
  if (newTargetDate <= last.date) return pts;
  return [...pts.slice(0, -1), { date: newTargetDate, kg: last.kg }];
}

// ---------------------------------------------------------------- weight trend

export type Weigh = { date: string; kg: number };

/** 7-day average ending on `date`; needs 3+ weigh-ins in the window. */
export function avg7(weighs: Weigh[], date: string): number | null {
  const from = addDays(date, -6);
  const w = weighs.filter((x) => x.date >= from && x.date <= date);
  return w.length >= 3 ? w.reduce((s, x) => s + x.kg, 0) / w.length : null;
}

/** Loss rate in lb/week over the `weeks` weeks ending on `date` (positive = losing). */
export function rateLbWk(weighs: Weigh[], date: string, weeks = 1): number | null {
  const now = avg7(weighs, date);
  const then = avg7(weighs, addDays(date, -7 * weeks));
  return now === null || then === null ? null : (then - now) / LB / weeks;
}

// ---------------------------------------------------------------- training energy

export type Zones = { ftp_w?: number | null; threshold_speed_mps?: number | null };
export type PlanMeta = { is_key?: boolean; planned_duration_min?: number; category?: string; fueling?: { carb_g_per_hr?: number } | null } | null;
export type PlannedSession = {
  id?: string;
  sport: string;
  title: string;
  steps: Step[];
  brick?: { sport: "run"; steps: Step[] } | null;
  test_kind?: string | null;
  plan_meta?: PlanMeta;
  start_time?: string | null; // "HH:MM[:SS]"
  pool_yards?: boolean;
};
export type DoneActivity = { sport: string; duration_s: number; distance_m: number | null; avg_power: number | null; calories: number | null };

type Leaf = { sec: number; meters: number; watts: number | null; aboveZ2: boolean; hard: boolean };
const DEFAULT_SPEED: Record<string, number> = { run: 2.9, bike: 7.5, swim: 0.9 };
const OPEN_SEC: Record<string, number> = { WARMUP: 600, COOLDOWN: 600 };

function speed(sport: string, t: Target | undefined, z: Zones, yards: boolean): number {
  if (t?.type === "pace_range") return 1000 / ((t.slowSecPerKm + t.fastSecPerKm) / 2);
  if (t?.type === "swim_pace") return ((yards ? 91.44 : 100) / t.secPer100) * 0.9;
  if (sport === "run" && z.threshold_speed_mps) return Number(z.threshold_speed_mps) * 0.8;
  return DEFAULT_SPEED[sport] ?? 2.9;
}

/** Is this step above endurance (Z2)? Bike > 75% FTP, run faster than 88% of threshold speed, HR zone 3+, swim effort 4+. */
function aboveZ2(intensity: string, t: Target | undefined, z: Zones): boolean {
  if (t?.type === "power_range") return z.ftp_w ? t.high > 0.75 * z.ftp_w : intensity === "INTERVAL";
  if (t?.type === "pace_range") return z.threshold_speed_mps ? 1000 / t.fastSecPerKm > 0.88 * Number(z.threshold_speed_mps) : intensity === "INTERVAL";
  if (t?.type === "hr_zone") return t.zone >= 3;
  if (t?.type === "swim_effort") return t.level >= 4;
  if (t?.type === "swim_pace") return true; // paced swim sets are CSS-type work
  return intensity === "INTERVAL";
}
function hardStep(intensity: string, t: Target | undefined, z: Zones): boolean {
  if (t?.type === "power_range" && z.ftp_w) return t.high >= 0.88 * z.ftp_w;
  if (t?.type === "pace_range" && z.threshold_speed_mps) return 1000 / t.fastSecPerKm >= 0.96 * Number(z.threshold_speed_mps);
  if (t?.type === "hr_zone") return t.zone >= 4;
  if (t?.type === "swim_effort") return t.level >= 6;
  return intensity === "INTERVAL";
}

function leaves(steps: Step[], sport: string, z: Zones, yards = false): Leaf[] {
  const out: Leaf[] = [];
  const walk = (list: Step[], times: number) => {
    for (const s of list ?? []) {
      if (s.kind === "repeat") {
        walk(s.steps, times * s.times);
        continue;
      }
      const v = speed(sport, s.target, z, yards);
      const d = s.duration;
      const sec = d.type === "time" || d.type === "sendoff" ? d.seconds : d.type === "distance" ? d.meters / v : (OPEN_SEC[s.intensity] ?? 0);
      const meters = d.type === "distance" ? d.meters : sec * v;
      const watts = s.target?.type === "power_range" ? (s.target.low + s.target.high) / 2 : null;
      for (let i = 0; i < times; i++) out.push({ sec, meters, watts, aboveZ2: aboveZ2(s.intensity, s.target, z), hard: hardStep(s.intensity, s.target, z) });
    }
  };
  walk(steps, 1);
  return out;
}

export type SessionEnergy = { sport: string; minutes: number; kcal: number; hardMinutes: number; aboveZ2: boolean };

/** Planned training energy for one sport block. Bike: kJ ≈ kcal. Run: 0.75 kcal/lb/mile. Swim: 450–550 kcal/h. Strength: 250 kcal/h. */
export function plannedEnergy(sport: string, steps: Step[], z: Zones, weightKg: number, fallbackMin = 45, yards = false): SessionEnergy {
  const ls = leaves(steps, sport, z, yards);
  let sec = ls.reduce((s, l) => s + l.sec, 0);
  if (sec < 60) sec = fallbackMin * 60;
  const hardSec = ls.filter((l) => l.hard).reduce((s, l) => s + l.sec, 0);
  const above = ls.some((l) => l.aboveZ2);
  const minutes = Math.round(sec / 60);
  let kcal = 0;
  if (sport === "bike") {
    const ftp = Number(z.ftp_w) || 200;
    kcal = ls.length ? ls.reduce((s, l) => s + (l.watts ?? (l.aboveZ2 ? 0.8 : 0.6) * ftp) * l.sec, 0) / 1000 : 0.62 * ftp * sec / 1000;
  } else if (sport === "run") {
    const meters = ls.length ? ls.reduce((s, l) => s + l.meters, 0) : sec * speed("run", undefined, z, false);
    kcal = 0.75 * (weightKg / LB) * (meters / 1609.344);
  } else if (sport === "swim") {
    const hardShare = Math.min(1, hardSec / Math.max(1, sec) / 0.4);
    kcal = (450 + 100 * Math.max(above ? 0.5 : 0, hardShare)) * (sec / 3600);
  } else if (sport === "strength") {
    kcal = 250 * (sec / 3600);
  } else {
    kcal = 400 * (sec / 3600);
  }
  return { sport, minutes, kcal: Math.round(kcal), hardMinutes: Math.round(hardSec / 60), aboveZ2: above };
}

/** Training energy of a completed activity: power when the ride has it, then the same per-sport rules, then the device's kcal. */
export function doneEnergy(a: DoneActivity, weightKg: number): number {
  const h = a.duration_s / 3600;
  const s = (a.sport ?? "").toLowerCase();
  if (/bik|cycl|ride/.test(s)) {
    if (a.avg_power) return Math.round((a.avg_power * a.duration_s) / 1000);
    return Math.round(a.calories ?? 500 * h);
  }
  if (/run/.test(s) && a.distance_m) return Math.round(0.75 * (weightKg / LB) * (a.distance_m / 1609.344));
  if (/swim/.test(s)) return Math.round(500 * h);
  if (/strength|weight/.test(s)) return Math.round(250 * h);
  return Math.round(a.calories ?? 300 * h);
}

export const sportFamily = (s: string) => {
  const t = (s ?? "").toLowerCase();
  if (/bik|cycl|ride/.test(t)) return "bike";
  if (/run/.test(t)) return "run";
  if (/swim/.test(t)) return "swim";
  if (/strength|weight/.test(t)) return "strength";
  return "other";
};

// ---------------------------------------------------------------- day type

export type DayType = "rest" | "easy" | "moderate" | "key" | "carb_load" | "race";
export const DAY_LABEL: Record<DayType, string> = { rest: "Rest", easy: "Easy", moderate: "Moderate", key: "Key", carb_load: "Carb load", race: "Race" };

const RACE_SIM = /race.?sim/i;

/** A key session: the plan's own flag when it has one, else tests, bricks, race sims, 2 h+, or the coach-alert rule. */
export function isKey(p: PlannedSession, minutes: number, alertKey: boolean): boolean {
  if (p.test_kind || p.brick || RACE_SIM.test(p.title) || minutes >= 120) return true;
  if (p.plan_meta && typeof p.plan_meta.is_key === "boolean") return p.plan_meta.is_key;
  return alertKey; // not from the plan: callers pass 15+ hard minutes (see keyWithoutPlan)
}

/** The biggest sessions: tests, bricks, race sims, long rides/runs, races, or 2 h+. */
export function isBig(p: PlannedSession, minutes: number): boolean {
  const cat = p.plan_meta?.category ?? "";
  return !!(p.test_kind || p.brick || RACE_SIM.test(p.title) || minutes >= 120 || ["long_ride", "long_run", "race_sim", "test", "race"].includes(cat));
}

/** Watts days: tests and race sims. The day itself and the day before stay at maintenance. */
export function isTest(p: PlannedSession): boolean {
  const cat = p.plan_meta?.category ?? "";
  return !!(p.test_kind || RACE_SIM.test(p.title) || ["test", "race_sim", "race"].includes(cat));
}

/** Key rule for sessions that aren't plan rows: 15+ minutes of genuinely hard work. */
export const keyWithoutPlan = (e: SessionEnergy) => e.hardMinutes >= 15;

// ---------------------------------------------------------------- one day

export type Week = {
  baseline_kcal: number;
  baseline_source: "estimate" | "measured";
  easy_deficit: number;
  moderate_deficit: number;
  pause_until: string | null;
  pause_reason: string | null;
  target_date: string;
};

export type DayInput = {
  date: string;
  weightKg: number; // current (7-day average when there is one)
  goal: Goal;
  week: Week;
  planned: (PlannedSession & { energy: SessionEnergy; key: boolean })[];
  done: DoneActivity[]; // completed on this day (local)
  tomorrowKey: boolean;
  tomorrowBig?: boolean; // tomorrow has one of the biggest sessions (isBig)
  todayBig?: boolean; // today has one
  todayTest?: boolean; // a test or race sim today (isTest)
  tomorrowTest?: boolean;
  goalReached: boolean; // 7-day average already at or below the target
  aboveBand?: boolean; // 7-day average above target + hold band (only matters after race day)
};

export type DayTarget = {
  date: string;
  type: DayType;
  kcal: number;
  maintenance: number;
  deficit: number; // actually applied (after the floor)
  baseline: number;
  training: number;
  trainingSource: "planned" | "done" | "mixed" | "none";
  protein: number;
  carbs: number;
  fat: number;
  fuelCarbs: number; // during + pre + recovery carbs inside `carbs`, never cut
  proteinPerMeal: [number, number];
  reason: string;
  floored: boolean;
  surplus: number; // kcal over maintenance (strict carb floors only)
};

const CARB_RANGE: Record<DayType, [number, number]> = { rest: [3, 5], easy: [3, 5], moderate: [5, 7], key: [7, 10], carb_load: [8, 10], race: [7, 10] };

/** In-session carbs for a planned session: the plan's fueling field, else general guidance by length. */
export function sessionCarbs(p: PlannedSession, minutes: number): number {
  const perHr = p.plan_meta?.fueling?.carb_g_per_hr;
  if (typeof perHr === "number" && perHr > 0) return Math.round((perHr * minutes) / 60);
  if (minutes < 75) return 0;
  return Math.round(((minutes >= 150 ? 75 : 45) * minutes) / 60);
}

export type Tier = "none" | "easy" | "moderate" | "key" | "pre_big" | "big" | "watts" | "hold";

/** Wanted deficit for a day before the weekly scaling, the pause, and the floor. */
export function dayDeficit(d: DayInput, type: DayType): { wanted: number; tier: Tier } {
  const g = d.goal;
  if (type === "race" || type === "carb_load") return { wanted: 0, tier: "none" };
  if (d.date > g.maintain_until) {
    // Holding the base weight after race day.
    return d.aboveBand && (type === "rest" || type === "easy") ? { wanted: HOLD_DEFICIT, tier: "hold" } : { wanted: 0, tier: "none" };
  }
  if (d.date > d.week.target_date || d.goalReached) return { wanted: 0, tier: "none" };
  if (d.todayTest || d.tomorrowTest) return { wanted: 0, tier: "watts" };
  // The fast-loss guardrail lowers week.easy_deficit; the other tiers drop by the same amount.
  const cut = Math.max(0, g.easy_deficit - d.week.easy_deficit);
  if (d.todayBig) return { wanted: Math.max(0, (g.big_deficit ?? 300) - cut), tier: "big" };
  const base =
    type === "key" ? { wanted: Math.max(0, (g.key_deficit ?? 400) - cut), tier: "key" as Tier }
    : type === "moderate" ? { wanted: d.week.moderate_deficit, tier: "moderate" as Tier }
    : { wanted: d.week.easy_deficit, tier: "easy" as Tier };
  const pre = Math.max(0, (g.pre_big_deficit ?? 300) - cut);
  return d.tomorrowBig && pre < base.wanted ? { wanted: pre, tier: "pre_big" } : base;
}

/** What the planned line needs this week (kcal), held between WEEK_DEFICIT_MIN and WEEK_DEFICIT_MAX. */
export function weekNeed(g: Goal, monday: string): number {
  const drop = plannedKg(g.line, monday) - plannedKg(g.line, addDays(monday, 7));
  return Math.round(Math.min(WEEK_DEFICIT_MAX, Math.max(WEEK_DEFICIT_MIN, drop * KCAL_PER_KG)));
}

export function classify(i: Pick<DayInput, "date" | "goal" | "planned" | "done">): { type: DayType; minutes: number } {
  const raceDay = i.goal.maintain_until;
  if (i.date === raceDay) return { type: "race", minutes: 0 };
  if (i.date === addDays(raceDay, -1) || i.date === addDays(raceDay, -2)) return { type: "carb_load", minutes: 0 };
  const plannedMin = i.planned.reduce((s, p) => s + p.energy.minutes, 0);
  const doneMin = Math.round(i.done.reduce((s, a) => s + a.duration_s, 0) / 60);
  const minutes = Math.max(plannedMin, doneMin);
  if (i.planned.some((p) => p.key)) return { type: "key", minutes };
  if (!i.planned.length && doneMin < 20) return { type: "rest", minutes };
  const cardio = i.planned.filter((p) => p.sport !== "strength");
  const above = cardio.some((p) => p.energy.aboveZ2);
  const cardioMin = cardio.reduce((s, p) => s + p.energy.minutes, 0);
  if (!above && Math.max(cardioMin, doneMin) < 75) return { type: "easy", minutes };
  return { type: "moderate", minutes };
}

/** The day's targets. `deficitOverride` is the weekly-capped deficit for this day (from planWeek). */
export function dayTarget(i: DayInput, deficitOverride?: number): DayTarget {
  const kg = i.weightKg;
  const { type, minutes } = classify(i);

  // Training energy: completed sports replace their planned counterparts.
  const doneFam = new Set(i.done.map((a) => sportFamily(a.sport)));
  const plannedLeft = i.planned.filter((p) => !doneFam.has(sportFamily(p.sport)) && !(p.brick && doneFam.has("run") && doneFam.has("bike")));
  const doneKcal = i.done.reduce((s, a) => s + doneEnergy(a, kg), 0);
  const plannedKcal = plannedLeft.reduce((s, p) => s + p.energy.kcal, 0);
  const training = Math.round(doneKcal + plannedKcal);
  const trainingSource = i.done.length && plannedLeft.length ? "mixed" : i.done.length ? "done" : plannedLeft.length ? "planned" : "none";
  const baseline = i.week.baseline_kcal;
  const maintenance = baseline + training;

  // Deficit: tiered by day (dayDeficit), 0 after the goal date (until race day), once at goal, and while paused.
  const holding = i.date > i.goal.maintain_until;
  const afterGoal = !holding && (i.date > i.week.target_date || i.goalReached);
  const paused = !!i.week.pause_until && i.date <= i.week.pause_until;
  const { wanted, tier } = dayDeficit(i, type);
  let deficit = paused ? 0 : (deficitOverride ?? wanted);
  let kcal = maintenance - deficit;
  let floored = false;
  if (kcal < FLOOR_KCAL) {
    floored = true;
    kcal = FLOOR_KCAL;
    deficit = Math.max(0, maintenance - kcal);
  }

  // Macros. Protein 1.9 g/kg (1.8–2.0), 4 meals. Fueling carbs are a floor. Fat takes the rest, ≥ 0.8 g/kg.
  const protein = r5(1.9 * kg);
  const range = CARB_RANGE[type];
  const keyMorning = i.planned.some((p) => p.key && (!p.start_time || p.start_time < "12:00"));
  const trained = minutes >= 30;
  const fuelCarbs =
    i.planned.reduce((s, p) => s + sessionCarbs(p, p.energy.minutes), 0) + (keyMorning ? 30 : 0) + (trained ? Math.round(1 * kg) : 0);
  const fatMin = 0.8 * kg;
  const mode = i.goal.carb_floor ?? "fuel";
  const hardFloor = Math.max(fuelCarbs, 3 * kg);
  const rangeLow = Math.max(range[0] * kg, fuelCarbs);
  const strict = mode === "range" || (mode === "key_range" && (type === "key" || type === "race"));
  const fits = (kcal - protein * 4 - fatMin * 9) / 4; // most carbs that fit with fat at its floor
  const carbLow = strict ? rangeLow : Math.max(hardFloor, Math.min(rangeLow, fits));
  const carbHigh = Math.max(range[1] * kg, carbLow);
  let carbs: number;
  if (type === "carb_load") carbs = 9 * kg;
  else {
    const fromKcal = (kcal - protein * 4 - 1.0 * kg * 9) / 4; // fat at 1.0 g/kg if calories allow
    carbs = Math.min(carbHigh, Math.max(carbLow, fromKcal));
  }
  carbs = r5(carbs);
  let fat = (kcal - protein * 4 - carbs * 4) / 9;
  if (fat < fatMin) fat = fatMin; // never below the fat floor: calories rise instead
  fat = r5(fat);
  const total = r10(protein * 4 + carbs * 4 + fat * 9);
  if (total > kcal) deficit = Math.max(0, maintenance - total);
  const surplus = total - maintenance > 20 ? total - maintenance : 0; // ignore gram-rounding noise

  const reason = holding
    ? deficit > 0
      ? `Holding your base weight: 7-day average is above the band, small ${deficit} kcal deficit today.`
      : "Holding your base weight: maintenance."
    : afterGoal
    ? i.goalReached
      ? "At goal weight: maintenance."
      : "Race block: maintenance only from here to race day."
    : type === "race"
      ? "Race day: fuel the plan, no deficit."
      : type === "carb_load"
        ? "Carb load for race day: 9 g/kg carbs, no deficit. A 2–4 lb scale bump is expected."
        : paused
          ? `Deficit paused: ${i.week.pause_reason ?? "guardrail"} (until ${i.week.pause_until}).`
          : tier === "watts"
            ? i.todayTest
              ? "Test or race-sim today: maintenance, full fuel."
              : "Test or race-sim tomorrow: maintenance today."
            : surplus > 50
              ? `Carbs at ${range[0]} g/kg put you ${surplus} kcal over maintenance today.`
            : tier === "big" && deficit > 0
              ? `Long session today: small ${deficit} kcal deficit from dinner and snacks away from training; session and recovery carbs untouched.`
            : tier === "pre_big" && deficit > 0
              ? `Long session tomorrow: lighter ${deficit} kcal deficit, carbs kept up tonight.`
            : type === "key"
              ? deficit > 0
                ? `Key session today: ${deficit} kcal deficit, only from food away from training; session carbs untouched.`
                : "Key session today: maintenance this week (weekly deficit already reached)."
              : floored
                ? `${DAY_LABEL[type]} day: ${deficit} kcal deficit (held at the ${FLOOR_KCAL.toLocaleString()} kcal floor).`
                : deficit > 0
                  ? `${DAY_LABEL[type]} day: ${deficit} kcal deficit, taken from fat and carbs away from training.`
                  : `${DAY_LABEL[type]} day: maintenance this week (weekly deficit already reached).`;

  return {
    date: i.date,
    type,
    kcal: Math.max(total, kcal),
    maintenance,
    deficit,
    baseline,
    training,
    trainingSource,
    protein,
    carbs,
    fat,
    fuelCarbs: Math.round(fuelCarbs),
    proteinPerMeal: [Math.max(35, r5(protein / 4) - 5), Math.min(45, r5(protein / 4) + 5)],
    reason,
    floored,
    surplus,
  };
}

/**
 * A Monday-to-Sunday week: each day's tiered deficit, scaled down evenly when the week would beat what
 * the planned line needs (weekNeed). Never scaled up: a short week is accepted and the guardrails handle it.
 */
export function planWeekTargets(days: DayInput[]): { days: DayTarget[]; deficit: number; short: boolean; need: number } {
  const g = days[0]?.goal;
  const cutting = (d: DayInput) => d.date <= d.goal.maintain_until && !(d.date > d.week.target_date || d.goalReached);
  const wanted = days.map((d) => {
    const paused = !!d.week.pause_until && d.date <= d.week.pause_until;
    return paused ? 0 : dayDeficit(d, classify(d).type).wanted;
  });
  const need = g ? weekNeed(g, days[0].date) : WEEK_DEFICIT_MAX;
  const cutSum = wanted.reduce((a, w, i) => a + (cutting(days[i]) ? w : 0), 0);
  const scale = cutSum > need ? need / cutSum : 1;
  const out = days.map((d, i) => dayTarget(d, cutting(d) ? Math.floor((wanted[i] * scale) / 10) * 10 : wanted[i]));
  const deficit = out.reduce((s, t) => s + t.deficit - t.surplus, 0); // net: surplus days count against it
  const active = days.some(cutting);
  return { days: out, deficit, short: active && deficit < Math.min(need, WEEK_DEFICIT_MIN), need };
}

// ---------------------------------------------------------------- weekly: measured baseline

export type IntakeDay = { date: string; kcal: number; complete: boolean; training: number };

/**
 * Baseline from the weight trend and logged intake over the last 28 days (complete days only):
 * expenditure = mean intake + weight lost × 7,700 / days; baseline = that − mean training energy.
 * Null until there are 14+ complete days and a trend at both ends. Moves at most 150 kcal from `prev`.
 */
export function measuredBaseline(days: IntakeDay[], weighs: Weigh[], today: string, prev: number, estimate: number): number | null {
  const from = addDays(today, -27);
  const span = days.filter((d) => d.date >= from && d.date <= today && d.complete);
  if (span.length < 14) return null;
  const start = avg7(weighs, addDays(from, 6));
  const end = avg7(weighs, today);
  if (start === null || end === null) return null;
  const n = daysBetween(addDays(from, 3), addDays(today, -3)); // centres of the two 7-day windows
  const intake = span.reduce((s, d) => s + d.kcal, 0) / span.length;
  const training = span.reduce((s, d) => s + d.training, 0) / span.length;
  const tdee = intake + ((start - end) * KCAL_PER_KG) / n;
  let base = tdee - training;
  base = Math.min(estimate * 1.35, Math.max(estimate * 0.75, base)); // a mislogged week can't swing it wildly
  base = Math.min(prev + 150, Math.max(prev - 150, base));
  return Math.round(base);
}

// ---------------------------------------------------------------- guardrails

export type Guardrail = { rule: "fast_loss" | "stall" | "behind" | "performance" | "recovery" | "low_energy"; message: string };

export type WeeklyInput = {
  today: string; // the Sunday being evaluated (local)
  goal: Goal;
  prev: Week | null; // last week's state
  weighs: Weigh[];
  ftpByWeek: (number | null)[]; // oldest → newest, incl. this week
  keyPowerByWeek: (number | null)[]; // mean normalized/avg power of key rides per week, oldest → newest
  readiness7: string[]; // overall flags, last 7 days
  hrv7: number | null;
  hrv28: number | null;
  sleepH7: number | null;
  sleepScore7: number | null;
  rhr7: number | null;
  rhr28: number | null;
  checkins: { week_start: string; fatigue: boolean; low_libido: boolean; ill: boolean; low_mood: boolean }[]; // newest first
  sick: boolean; // health_pause sick/injured
  baselineEstimate: number;
  baselineMeasured: number | null;
};

export type WeeklyResult = Week & { avg_kg: number | null; planned_kg: number; rate_lb_wk: number | null; guardrails: Guardrail[]; proposeDeficitUp: boolean };

const down2 = (xs: (number | null)[], pct: number) => {
  const v = xs.slice(-3);
  if (v.length < 3 || v.some((x) => x === null)) return false;
  const [a, b, c] = v as number[];
  return b < a * (1 - pct) && c < b * (1 - pct);
};

/** Recovery/performance pause triggers; checked every evening (and in the weekly run). */
export function pauseCheck(i: Pick<WeeklyInput, "ftpByWeek" | "keyPowerByWeek" | "readiness7" | "hrv7" | "hrv28" | "sleepH7" | "sleepScore7" | "rhr7" | "rhr28" | "checkins" | "sick">): Guardrail | null {
  if (i.sick) return { rule: "low_energy", message: "You're marked sick or injured. Eat at maintenance until you're back to normal." };
  const c = i.checkins[0];
  const signs = c ? [c.fatigue && "persistent fatigue", c.low_libido && "low libido", c.ill && "illness", c.low_mood && "low mood"].filter(Boolean) as string[] : [];
  const repeat = c && i.checkins[1] && (["fatigue", "low_libido", "ill", "low_mood"] as const).some((k) => c[k] && i.checkins[1][k]);
  const rhrUp = i.rhr7 !== null && i.rhr28 !== null && i.rhr7 >= i.rhr28 + 5;
  if (signs.length >= 2 || repeat || (rhrUp && signs.length >= 1))
    return {
      rule: "low_energy",
      message: `Possible low energy availability (${[...signs, rhrUp ? "resting HR up" : ""].filter(Boolean).join(", ")}). Deficit off; worth a talk with a doctor or sports dietitian.`,
    };
  if (down2(i.ftpByWeek, 0) || down2(i.keyPowerByWeek, 0.02)) return { rule: "performance", message: "Power down two weeks in a row. Deficit off for 7 days so the watts come back first." };
  const reds = i.readiness7.filter((f) => f === "red").length;
  if (reds >= 3) return { rule: "recovery", message: `Readiness red ${reds} of the last 7 days. Deficit off for 7 days.` };
  if (i.hrv7 !== null && i.hrv28 !== null && i.hrv7 < i.hrv28 * 0.9) return { rule: "recovery", message: `HRV ${Math.round((1 - i.hrv7 / i.hrv28) * 100)}% below your 4-week average. Deficit off for 7 days.` };
  if ((i.sleepH7 !== null && i.sleepH7 < 6.5) || (i.sleepScore7 !== null && i.sleepScore7 < 60)) return { rule: "recovery", message: "Sleep has been short or poor this week. Deficit off for 7 days." };
  return null;
}

export function weekly(i: WeeklyInput): WeeklyResult {
  const g = i.goal;
  const t = i.today;
  const guardrails: Guardrail[] = [];
  const avg = avg7(i.weighs, t);
  const r1 = rateLbWk(i.weighs, t, 1);
  const rPrev = rateLbWk(i.weighs, addDays(t, -7), 1);
  let easy = i.prev?.easy_deficit ?? g.easy_deficit;
  let moderate = i.prev?.moderate_deficit ?? g.moderate_deficit;
  let targetDate = i.prev?.target_date ?? g.target_date;
  const line = shiftedLine(g.line, targetDate);
  const planned = plannedKg(line, t);
  const weeksIn = daysBetween(g.start_date, t) / 7;
  const losing = t <= targetDate && (avg === null || avg > g.target_kg);
  let proposeDeficitUp = false;

  // 1. Too fast (after the first two weeks): two straight weeks over the cap → 200 kcal less every deficit day.
  if (losing && weeksIn >= 3 && r1 !== null && rPrev !== null && r1 > g.max_rate_lb_wk && rPrev > g.max_rate_lb_wk) {
    easy = Math.max(0, easy - 200);
    moderate = Math.max(0, moderate - 200);
    guardrails.push({ rule: "fast_loss", message: `Losing ${r1.toFixed(1)} and ${rPrev.toFixed(1)} lb/week, over ${g.max_rate_lb_wk} lb/week. Deficit cut by 200 kcal/day.` });
  }

  // 2. Stalled three weeks → ask (never automatic) to add 100 on easy/rest days, capped at 600.
  const avg3 = avg7(i.weighs, addDays(t, -21));
  if (losing && weeksIn >= 3 && avg !== null && avg3 !== null && Math.abs(avg3 - avg) / LB < 0.3 && easy < EASY_DEFICIT_CAP && !guardrails.length) {
    proposeDeficitUp = true;
    guardrails.push({ rule: "stall", message: "7-day average hasn't moved in 3 weeks. Suggested: +100 kcal deficit on easy and rest days (your call)." });
  }

  // 3. More than 2 lb behind the line → move the goal date later (max latest_date). Never a bigger deficit.
  if (losing && avg !== null && (avg - planned) / LB > 2) {
    const rate = Math.max(0.4, Math.min(g.max_rate_lb_wk, r1 && r1 > 0 ? r1 : 0.65));
    const weeksLeft = (avg - g.target_kg) / LB / rate;
    const projected = addDays(t, Math.ceil(weeksLeft * 7));
    const next = projected > g.latest_date ? g.latest_date : projected;
    if (next > targetDate) {
      guardrails.push({
        rule: "behind",
        message: `${((avg - planned) / LB).toFixed(1)} lb behind the line. Goal date moved to ${next}${projected > g.latest_date ? " (the latest allowed; you may land a little above 165 and that's fine)" : ""}. Deficit unchanged.`,
      });
      targetDate = next;
    }
  }

  // 4–5. Performance, recovery, low energy → pause.
  let pauseUntil = i.prev?.pause_until && i.prev.pause_until >= t ? i.prev.pause_until : null;
  let pauseReason = pauseUntil ? i.prev!.pause_reason : null;
  const p = pauseCheck(i);
  if (p) {
    guardrails.push(p);
    pauseUntil = addDays(t, p.rule === "low_energy" ? 14 : 7);
    pauseReason = p.message;
  }

  const baseline = i.baselineMeasured ?? i.baselineEstimate;
  return {
    baseline_kcal: baseline,
    baseline_source: i.baselineMeasured ? "measured" : "estimate",
    easy_deficit: easy,
    moderate_deficit: moderate,
    pause_until: pauseUntil,
    pause_reason: pauseReason,
    target_date: targetDate,
    avg_kg: avg === null ? null : Math.round(avg * 100) / 100,
    planned_kg: Math.round(planned * 100) / 100,
    rate_lb_wk: r1 === null ? null : Math.round(r1 * 100) / 100,
    guardrails,
    proposeDeficitUp,
  };
}

/** "On track for Apr 4" or the projected date from the recent rate (null when no trend yet). */
export function projection(g: Goal, weighs: Weigh[], today: string, targetDate: string): { onTrack: boolean; date: string | null; behindLb: number | null } {
  const avg = avg7(weighs, today);
  if (avg === null) return { onTrack: true, date: null, behindLb: null };
  const planned = plannedKg(shiftedLine(g.line, targetDate), today);
  const behind = (avg - planned) / LB;
  if (avg <= g.target_kg) return { onTrack: true, date: today, behindLb: behind };
  const r = rateLbWk(weighs, today, 2) ?? rateLbWk(weighs, today, 1);
  const date = r && r > 0.05 ? addDays(today, Math.ceil(((avg - g.target_kg) / LB / r) * 7)) : null;
  return { onTrack: behind <= 1 && (!date || date <= targetDate), date, behindLb: behind };
}

// ---------------------------------------------------------------- the Fuel rings

type Range = { low: number; high: number };
/** The day's target as the ranges the Fuel rings use (they fill toward `low`). */
export function asRingTargets(t: DayTarget, kg: number): { carbs: Range; protein: Range; fat: Range; kcal: Range } {
  return {
    kcal: { low: t.kcal - 50, high: t.kcal + 150 },
    protein: { low: r5(1.8 * kg), high: r5(2.0 * kg) },
    carbs: { low: Math.max(t.fuelCarbs, t.carbs - 15), high: t.carbs + 25 },
    fat: { low: Math.max(r5(0.8 * kg), t.fat - 10), high: t.fat + 10 },
  };
}
