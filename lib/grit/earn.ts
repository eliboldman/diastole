// How grit is earned. Pure rules (tested in earn.test.ts); lib/grit/settle.ts feeds them and saves
// what comes out. Every award has a stable ref, so re-running never pays twice.
//
// A session earns by minutes x how hard it felt, then x how ready they were that day. A planned
// session done on a low-readiness day earns more, because showing up then is harder. That bonus
// never applies in sick/injured mode or when the check-in flags real pain, and choosing to back off
// on a low day ("Life happened → feeling off") earns grit too, so grit never pushes anyone to train
// through something.

export type Flag = "green" | "yellow" | "red" | "unknown";
export type EarnActivity = {
  id: string;
  start_time: string;
  duration_s: number | null;
  sport: string | null;
  training_load: number | null;
  planned_workout_id: string | null;
};
export type EarnCheckin = { activity_id: string; rpe: number | null; pain: Record<string, number> | null; created_at: string };
export type EarnInput = {
  tz: string;
  activities: EarnActivity[];
  checkins: EarnCheckin[];
  readiness: Record<string, { overall: Flag; sleep: Flag }>; // by local date
  planned: { id: string; date: string; sport: string | null }[];
  pausedSince: string | null; // sick/injured mode start (local date)
  backedOff: { id: string; date: string }[]; // "feeling off" plan changes
};
export type Award = { kind: string; ref: string; amount: number; reason: string; detail?: Record<string, unknown> };

export const MIN_MINUTES = 10;
export const SESSION_DAY_CAP = 80;
export const CHECKIN_GRIT = 5;
export const PLANNED_BONUS = 3;
export const SMART_REST_GRIT = 10;
export const READINESS_MULT: Record<Flag, number> = { green: 1, yellow: 1.15, red: 1.3, unknown: 1 };

const SEVERITY: Record<Flag, number> = { unknown: 0, green: 1, yellow: 2, red: 3 };
const localDay = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const family = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|walk|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : /strength|weight|gym|lift/i.test(s ?? "") ? "strength" : "other");
const SPORT_WORD: Record<string, string> = { swim: "Swim", run: "Run", bike: "Ride", strength: "Strength", other: "Session" };

/** How hard the session felt, as a multiplier around 1: check-in RPE first, else load per hour. */
export function effortFactor(rpe: number | null | undefined, load: number | null, minutes: number): number {
  if (rpe && rpe >= 1 && rpe <= 10) return Math.round((0.6 + rpe * 0.08) * 100) / 100; // RPE 5 = 1.0, 10 = 1.4
  if (load && load > 0 && minutes > 0) {
    const perHour = (load / minutes) * 60;
    return Math.round(Math.min(1.4, Math.max(0.7, 0.7 + (perHour - 40) / 150)) * 100) / 100;
  }
  return 1;
}

/** That day's readiness for grit: the worse of overall and sleep (a short night counts). */
export function dayFlag(r: { overall: Flag; sleep: Flag } | undefined): Flag {
  if (!r) return "unknown";
  return SEVERITY[r.sleep] > SEVERITY[r.overall] ? r.sleep : r.overall;
}

const painful = (p: Record<string, number> | null | undefined) => Object.values(p ?? {}).some((v) => v >= 2);

export function sessionAwards(input: EarnInput): Award[] {
  const checkin = new Map(input.checkins.map((c) => [c.activity_id, c]));
  const plannedByDay = new Map<string, { id: string; sport: string | null }[]>();
  for (const p of input.planned) plannedByDay.set(p.date, [...(plannedByDay.get(p.date) ?? []), p]);
  const usedPlans = new Set<string>();

  const out: Award[] = [];
  const perDay = new Map<string, number>();
  for (const a of [...input.activities].sort((x, y) => x.start_time.localeCompare(y.start_time))) {
    const minutes = Math.round((a.duration_s ?? 0) / 60);
    if (minutes < MIN_MINUTES) continue;
    const day = localDay(a.start_time, input.tz);
    const c = checkin.get(a.id);
    const effort = effortFactor(c?.rpe, a.training_load, minutes);
    const fam = family(a.sport);
    const plan = a.planned_workout_id
      ? (plannedByDay.get(day) ?? []).find((p) => p.id === a.planned_workout_id) ?? { id: a.planned_workout_id, sport: a.sport }
      : (plannedByDay.get(day) ?? []).find((p) => !usedPlans.has(p.id) && family(p.sport) === fam);
    if (plan) usedPlans.add(plan.id);
    const paused = Boolean(input.pausedSince && day >= input.pausedSince);
    const flag = dayFlag(input.readiness[day]);
    // The low-readiness bonus is only for the coach's plan, and never when sick, injured or hurting.
    const mult = plan && !paused && !painful(c?.pain) ? READINESS_MULT[flag] : 1;
    let amount = Math.round((Math.min(minutes, 240) / 6) * effort * mult) + (plan ? PLANNED_BONUS : 0);
    const used = perDay.get(day) ?? 0;
    amount = Math.max(0, Math.min(amount, SESSION_DAY_CAP - used));
    perDay.set(day, used + amount);
    if (amount <= 0) continue;
    out.push({
      kind: "session",
      ref: a.id,
      amount,
      reason: `${SPORT_WORD[fam]}, ${minutes} min${plan ? " (planned)" : ""}`,
      detail: { minutes, effort, readiness: flag, mult, planned: Boolean(plan), day },
    });
  }
  return out;
}

export function checkinAwards(input: EarnInput): Award[] {
  return input.checkins
    .filter((c) => c.rpe != null || Object.keys(c.pain ?? {}).length > 0)
    .map((c) => ({ kind: "checkin", ref: c.activity_id, amount: CHECKIN_GRIT, reason: "Workout check-in", detail: { day: localDay(c.created_at || new Date().toISOString(), input.tz) } }));
}

/** Backing off on a yellow or red readiness day (one a day): a smart call. Sick/injured mode earns nothing and costs nothing. */
export function smartRestAwards(input: EarnInput): Award[] {
  const out: Award[] = [];
  const days = new Set<string>();
  for (const b of input.backedOff) {
    const flag = dayFlag(input.readiness[b.date]);
    if ((flag === "yellow" || flag === "red") && !days.has(b.date)) {
      days.add(b.date);
      out.push({ kind: "smart_rest", ref: `day:${b.date}`, amount: SMART_REST_GRIT, reason: "Smart call: eased off on a low-readiness day", detail: { day: b.date } });
    }
  }
  return out;
}

export function allAwards(input: EarnInput): Award[] {
  return [...sessionAwards(input), ...checkinAwards(input), ...smartRestAwards(input)];
}

/** Camp goal reached (camp over, team total at or above the goal, and they took part). */
export const CAMP_GRIT = 50;
export function campAward(camp: { id: string; title: string; goal_value: number; ends_on: string }, total: number, tookPart: boolean, today: string): Award | null {
  if (!tookPart || today <= camp.ends_on || total < camp.goal_value) return null;
  return { kind: "camp", ref: camp.id, amount: CAMP_GRIT, reason: `Camp goal: ${camp.title}`.slice(0, 120), detail: { day: camp.ends_on } };
}

export const balanceOf = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
