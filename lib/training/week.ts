// Planned vs done for one week (Monday to Sunday, the athlete's days): each planned session with
// whether it happened, how long it was against plan, plus per-sport totals and extra sessions.
// Pure module (type imports only) so it can be tested directly with `node`.

import type { Brick, Pool, Step } from "../workouts/garmin-format.ts";
import { strengthSeconds, type StrengthItem } from "../strength/workout.ts";
import { workoutTotals, type Zones } from "../workouts/totals.ts";

const DAY = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
export const localDay = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

export type Family = "run" | "bike" | "swim" | "strength" | "other";
export const familyOf = (s: string | null | undefined): Family =>
  /swim/i.test(s ?? "") ? "swim" : /run|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : /strength|weight|gym/i.test(s ?? "") ? "strength" : "other";

export type WeekPlan = { id: string; date: string; sport: string; title: string; steps: Step[]; pool: Pool; brick?: Brick; strength?: StrengthItem[] | null };
export type WeekActivity = { id: string; start_time: string; sport: string | null; duration_s: number | null; distance_m: number | null; planned_workout_id: string | null };

export type SessionStatus = "done" | "short" | "missed" | "today" | "upcoming";
export type WeekSession = {
  plan: WeekPlan;
  status: SessionStatus;
  activity: WeekActivity | null;
  /** a brick's run, when it was saved as its own activity */
  brickRun?: WeekActivity | null;
  plannedSec: number;
  plannedM: number;
  /** done time / planned time, when both are known */
  ratio: number | null;
};
export type SportTotals = { family: Family; plannedSec: number; plannedM: number; doneSec: number; doneM: number };
export type WeekReview = {
  start: string; // Monday
  end: string; // Sunday
  sessions: WeekSession[];
  extras: WeekActivity[];
  sports: SportTotals[];
  /** planned sessions whose day has come (today counts once done) */
  due: number;
  done: number;
};

/** Under this share of the planned time, a session counts as cut short. */
export const SHORT = 0.7;

export function weekReview(opts: { start: string; today: string; tz: string; plans: WeekPlan[]; activities: WeekActivity[]; zones?: Zones }): WeekReview {
  const { start, today, tz } = opts;
  const end = addDays(start, 6);
  const plans = opts.plans.filter((p) => p.date >= start && p.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const acts = opts.activities
    .map((a) => ({ a, day: localDay(a.start_time, tz), fam: familyOf(a.sport) }))
    .filter((x) => x.day >= start && x.day <= end)
    .sort((x, y) => x.a.start_time.localeCompare(y.a.start_time));

  // Match: the explicit link first, then same day and sport, one activity per plan.
  const used = new Set<string>();
  const matched = new Map<string, WeekActivity>();
  for (const p of plans) {
    const linked = acts.find((x) => x.a.planned_workout_id === p.id);
    if (linked) {
      matched.set(p.id, linked.a);
      used.add(linked.a.id);
    }
  }
  const multi = (s: string | null) => /multi|triathlon|brick|transition/i.test(s ?? "");
  for (const p of plans) {
    if (matched.has(p.id)) continue;
    const brick = Boolean(p.brick?.steps?.length);
    const same = acts.find((x) => !used.has(x.a.id) && !x.a.planned_workout_id && x.day === p.date && (x.fam === familyOf(p.sport) || (brick && multi(x.a.sport))));
    if (same) {
      matched.set(p.id, same.a);
      used.add(same.a.id);
    }
  }
  // Bricks: the run off the bike is often its own activity the same day.
  const brickRuns = new Map<string, WeekActivity>();
  for (const p of plans) {
    const a = matched.get(p.id);
    if (!p.brick?.steps?.length || !a || multi(a.sport)) continue;
    const run = acts.find((x) => !used.has(x.a.id) && x.day === p.date && x.fam === "run" && (!x.a.planned_workout_id || x.a.planned_workout_id === p.id));
    if (run) {
      brickRuns.set(p.id, run.a);
      used.add(run.a.id);
    }
  }

  const sports = new Map<Family, SportTotals>();
  const sport = (f: Family) => sports.get(f) ?? sports.set(f, { family: f, plannedSec: 0, plannedM: 0, doneSec: 0, doneM: 0 }).get(f)!;

  let due = 0;
  let done = 0;
  const sessions: WeekSession[] = plans.map((p) => {
    const t = p.sport === "strength" ? { seconds: strengthSeconds(p.strength ?? []), meters: 0, distanceEstimated: false, timeEstimated: true, openSteps: 0, hardSeconds: 0 } : workoutTotals(p.steps, p.sport, p.pool, opts.zones ?? null);
    const fam = familyOf(p.sport);
    const s = sport(fam);
    s.plannedSec += t.seconds;
    // Bike distance from time is a guess; only count planned distance the steps set.
    let plannedM = fam === "bike" && t.distanceEstimated ? 0 : t.meters;
    s.plannedM += plannedM;
    // A brick's run counts toward run time and distance (and the session's total).
    let plannedSec = t.seconds;
    if (p.brick?.steps?.length) {
      const r = workoutTotals(p.brick.steps, "run", null, opts.zones ?? null);
      const run = sport("run");
      run.plannedSec += r.seconds;
      run.plannedM += r.meters;
      plannedSec += r.seconds;
      plannedM += r.meters;
    }
    const a = matched.get(p.id) ?? null;
    const brickRun = brickRuns.get(p.id) ?? null;
    const doneSec = (a?.duration_s ?? 0) + (brickRun?.duration_s ?? 0);
    const ratio = a && doneSec && plannedSec ? doneSec / plannedSec : null;
    const status: SessionStatus = a ? (ratio !== null && ratio < SHORT ? "short" : "done") : p.date < today ? "missed" : p.date === today ? "today" : "upcoming";
    if (a || p.date < today) due++;
    if (a) done++;
    return { plan: p, status, activity: a, brickRun, plannedSec, plannedM, ratio };
  });

  for (const x of acts) {
    const s = sport(x.fam);
    s.doneSec += x.a.duration_s ?? 0;
    s.doneM += x.a.distance_m ?? 0;
  }

  const order: Family[] = ["run", "bike", "swim", "strength", "other"];
  return {
    start,
    end,
    sessions,
    extras: acts.filter((x) => !used.has(x.a.id)).map((x) => x.a),
    sports: order.map((f) => sports.get(f)).filter((s): s is SportTotals => Boolean(s && (s.plannedSec || s.doneSec || s.plannedM || s.doneM))),
    due,
    done,
  };
}
