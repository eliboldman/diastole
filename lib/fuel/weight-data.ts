import "server-only";

// Loads what lib/fuel/weight-plan.ts needs: the active goal, the weight log, the week's state, planned
// sessions and completed activities. Works with the signed-in client (row-level security: athlete or
// head coach) or the admin client (evening job).

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCompleteDay } from "@/lib/fuel/safety";
import { isKeySession } from "@/lib/training/alerts";
import type { Step } from "@/lib/workouts/garmin-format";

import {
  addDays,
  avg7,
  doneEnergy,
  estimatedBaseline,
  isBig,
  isKey,
  isTest,
  LB,
  keyWithoutPlan,
  mondayOf,
  planWeekTargets,
  plannedEnergy,
  projection,
  type DayInput,
  type DayTarget,
  type DoneActivity,
  type Goal,
  type PlannedSession,
  type Week,
  type Weigh,
} from "./weight-plan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getActiveGoal(db: DB, athleteId: string): Promise<Goal | null> {
  const { data } = await db.from("weight_goals").select("*").eq("athlete_id", athleteId).eq("active", true).maybeSingle();
  if (!data) return null;
  return {
    ...data,
    height_cm: Number(data.height_cm),
    activity_factor: Number(data.activity_factor),
    start_kg: Number(data.start_kg),
    target_kg: Number(data.target_kg),
    max_rate_lb_wk: Number(data.max_rate_lb_wk),
    hold_band_lb: Number(data.hold_band_lb ?? 2),
    line: (data.line as { date: string; kg: number }[]).map((p) => ({ date: p.date, kg: Number(p.kg) })),
  } as Goal;
}

export async function getWeighs(db: DB, athleteId: string, from: string): Promise<Weigh[]> {
  const { data } = await db.from("body_weights").select("date, weight_kg").eq("athlete_id", athleteId).gte("date", from).order("date");
  return (data ?? []).map((r) => ({ date: r.date, kg: Number(r.weight_kg) }));
}

/** Current weight for per-kg math: the 7-day average, else the latest weigh-in, else the goal's start. */
export function currentKg(weighs: Weigh[], today: string, goal: Goal): number {
  return avg7(weighs, today) ?? weighs.filter((w) => w.date <= today).at(-1)?.kg ?? goal.start_kg;
}

export type WeekRow = Week & { week_start: string; avg_kg: number | null; planned_kg: number | null; rate_lb_wk: number | null; ftp_w: number | null; guardrails: { rule: string; message: string }[]; computed_at: string };

export async function getWeekRows(db: DB, goalId: string): Promise<WeekRow[]> {
  const { data } = await db.from("weight_goal_weeks").select("*").eq("goal_id", goalId).order("week_start");
  return (data ?? []).map((r) => ({ ...r, avg_kg: num(r.avg_kg), planned_kg: num(r.planned_kg), rate_lb_wk: num(r.rate_lb_wk) })) as WeekRow[];
}

/** The state in effect on `date`: the latest weekly row starting on or before it, else a first-week default from the goal. */
export function weekFor(rows: WeekRow[], date: string, goal: Goal, kg: number): Week {
  const row = [...rows].reverse().find((r) => r.week_start <= date);
  if (row) return row;
  return {
    baseline_kcal: estimatedBaseline(kg, goal, date),
    baseline_source: "estimate",
    easy_deficit: goal.easy_deficit,
    moderate_deficit: goal.moderate_deficit,
    pause_until: null,
    pause_reason: null,
    target_date: goal.target_date,
  };
}

type PlanRow = PlannedSession & { scheduled_date: string; pool_unit: string | null };

/** Planned sessions (approved or sent, not skipped) and completed activities for [from, to] in the athlete's time zone. */
export async function getTraining(db: DB, athleteId: string, from: string, to: string, timeZone: string) {
  const [{ data: plans }, { data: acts }, { data: zones }] = await Promise.all([
    db
      .from("planned_workouts")
      .select("id, scheduled_date, sport, title, steps, brick, test_kind, plan_meta, start_time, pool_unit")
      .eq("athlete_id", athleteId)
      .is("deleted_at", null)
      .not("status", "in", "(draft,skipped)")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date"),
    db
      .from("activities")
      .select("start_time, sport, duration_s, distance_m, avg_power, calories")
      .eq("athlete_id", athleteId)
      .gte("start_time", `${addDays(from, -1)}T00:00:00Z`)
      .lt("start_time", `${addDays(to, 2)}T00:00:00Z`),
    db.from("athlete_zones").select("ftp_w, threshold_speed_mps").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const local = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
  const done = new Map<string, DoneActivity[]>();
  for (const a of acts ?? []) {
    if (!a.start_time || (a.duration_s ?? 0) < 300) continue;
    const d = local(a.start_time);
    if (d < from || d > to) continue;
    done.set(d, [...(done.get(d) ?? []), { sport: a.sport ?? "", duration_s: a.duration_s ?? 0, distance_m: num(a.distance_m), avg_power: num(a.avg_power), calories: num(a.calories) }]);
  }
  return { plans: (plans ?? []) as PlanRow[], done, zones: zones ?? {} };
}

/** Day inputs for each date in [from, from + days), with the key flag for the day after the last one. */
export async function dayInputs(db: DB, athleteId: string, goal: Goal, rows: WeekRow[], weighs: Weigh[], from: string, days: number, timeZone: string): Promise<DayInput[]> {
  const to = addDays(from, days); // one extra day for "key tomorrow"
  const { plans, done, zones } = await getTraining(db, athleteId, from, to, timeZone);
  const today = new Date().toLocaleDateString("en-CA", { timeZone });
  const kg = currentKg(weighs, today < from ? today : from, goal);
  const sessions = (date: string) =>
    plans
      .filter((p) => p.scheduled_date === date)
      .map((p) => {
        const steps = (p.steps ?? []) as Step[];
        const fallback = p.plan_meta?.planned_duration_min ?? 45;
        const main = plannedEnergy(p.sport, steps, zones, kg, fallback, p.pool_unit === "YARD");
        const brick = p.brick ? plannedEnergy("run", p.brick.steps, zones, kg, 15) : null;
        const energy = brick
          ? { ...main, minutes: main.minutes + brick.minutes, kcal: main.kcal + brick.kcal, hardMinutes: main.hardMinutes + brick.hardMinutes, aboveZ2: main.aboveZ2 || brick.aboveZ2 }
          : main;
        const alertKey = p.sport === "strength" ? false : isKeySession(p.title, steps, p.sport) && keyWithoutPlan(energy);
        return { ...p, energy, key: isKey(p, energy.minutes, alertKey) };
      });
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const a = avg7(weighs, date);
    return {
      date,
      weightKg: currentKg(weighs, date, goal),
      goal,
      week: weekFor(rows, date, goal, kg),
      planned: sessions(date),
      done: done.get(date) ?? [],
      tomorrowKey: sessions(addDays(date, 1)).some((s) => s.key),
      tomorrowBig: sessions(addDays(date, 1)).some((s) => isBig(s, s.energy.minutes)),
      todayBig: sessions(date).some((s) => isBig(s, s.energy.minutes)),
      todayTest: sessions(date).some(isTest),
      tomorrowTest: sessions(addDays(date, 1)).some(isTest),
      goalReached: a !== null && a <= goal.target_kg,
      aboveBand: a !== null && a > goal.target_kg + (goal.hold_band_lb ?? 2) * LB,
    };
  });
}

export type WeightView = {
  goal: Goal;
  today: string;
  weighs: Weigh[];
  rows: WeekRow[];
  week: Week;
  todayTarget: DayTarget;
  weekTargets: { days: DayTarget[]; deficit: number; short: boolean; need: number };
  projection: ReturnType<typeof projection>;
  avg: number | null;
  checkedIn: boolean;
};

/** Everything the Fuel card and the weight page show. Null when the athlete has no active goal. */
export async function getWeightView(db: DB, athleteId: string, timeZone: string): Promise<WeightView | null> {
  const goal = await getActiveGoal(db, athleteId);
  if (!goal) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone });
  const monday = mondayOf(today);
  const [weighs, rows, { data: ci }] = await Promise.all([
    getWeighs(db, athleteId, addDays(goal.start_date, -35)),
    getWeekRows(db, goal.id),
    db.from("energy_checkins").select("week_start").eq("athlete_id", athleteId).eq("week_start", monday).maybeSingle(),
  ]);
  const inputs = await dayInputs(db, athleteId, goal, rows, weighs, monday, 7, timeZone);
  const weekTargets = planWeekTargets(inputs);
  const todayTarget = weekTargets.days.find((d) => d.date === today)!;
  const week = weekFor(rows, today, goal, currentKg(weighs, today, goal));
  return { goal, today, weighs, rows, week, todayTarget, weekTargets, projection: projection(goal, weighs, today, week.target_date), avg: avg7(weighs, today), checkedIn: !!ci };
}

/** Logged intake and training energy per day, for the measured baseline. Complete days only count there. */
export async function intakeDays(db: DB, athleteId: string, goal: Goal, rows: WeekRow[], weighs: Weigh[], from: string, days: number, timeZone: string) {
  const to = addDays(from, days - 1);
  const [{ data: meals }, inputs] = await Promise.all([
    db.from("meal_logs").select("local_date, eaten_at, kcal").eq("athlete_id", athleteId).gte("local_date", from).lte("local_date", to),
    dayInputs(db, athleteId, goal, rows, weighs, from, days, timeZone),
  ]);
  const hour = (iso: string) => Number(new Date(iso).toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", hour12: false }).slice(0, 2));
  return inputs.map((d) => {
    const m = (meals ?? []).filter((x) => x.local_date === d.date);
    const training = d.done.reduce((s, a) => s + doneEnergy(a, d.weightKg), 0); // past days: only what was actually done
    return {
      date: d.date,
      kcal: m.reduce((s, x) => s + Number(x.kcal), 0),
      complete: isCompleteDay(m.map((x) => ({ hour: hour(x.eaten_at), kcal: Number(x.kcal), carbs: 0 }))),
      training,
    };
  });
}
