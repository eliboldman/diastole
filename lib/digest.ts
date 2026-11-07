import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { spotLabel, type Spot } from "@/lib/avatar/pain";
import type { Flag } from "@/lib/readiness/engine";

// The coach's weekly digest: per athlete, planned vs done, hours vs their usual, readiness, pain
// and upcoming races, with the athletes who need a look first. Rules only, no AI.

export type DigestAthlete = {
  id: string;
  name: string;
  planned: number;
  completed: number;
  missed: { title: string; date: string }[];
  hours: number;
  sessions: number;
  usualHours: number | null; // average of the 4 weeks before
  red: number;
  yellow: number;
  latest: Flag | null;
  pain: string[]; // "left knee (moderate)"
  feel: number | null; // average 1-5
  rpe: number | null;
  race: { name: string; date: string; days: number } | null;
  attention: string[];
};

export type Digest = {
  weekStart: string;
  weekEnd: string;
  team: { hours: number; sessions: number; planned: number; completed: number };
  athletes: DigestAthlete[];
};

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const family = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : "other");

/** Monday of the last full week (Mon-Sun) before today, in this timezone. */
export function lastWeekStart(timeZone: string, now = new Date()) {
  const today = now.toLocaleDateString("en-CA", { timeZone });
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(today, -dow - 7);
}

export async function buildDigest(supabase: SupabaseClient, coachId: string, weekStart: string): Promise<Digest> {
  const weekEnd = addDays(weekStart, 6);
  const { data: roster } = await supabase.from("profiles").select("id, full_name, email, timezone").eq("coach_id", coachId).eq("is_test", false).order("full_name");
  const ids = (roster ?? []).map((a) => a.id);
  const empty: Digest = { weekStart, weekEnd, team: { hours: 0, sessions: 0, planned: 0, completed: 0 }, athletes: [] };
  if (!ids.length) return empty;

  // A day of slack on each side so every athlete's local week is covered.
  const from = new Date(Date.parse(`${addDays(weekStart, -28)}T00:00:00Z`) - DAY).toISOString();
  const to = new Date(Date.parse(`${weekEnd}T23:59:59Z`) + DAY).toISOString();
  const [{ data: acts }, { data: planned }, { data: readiness }, { data: checkins }, { data: races }] = await Promise.all([
    supabase.from("activities").select("id, athlete_id, sport, start_time, duration_s, planned_workout_id").in("athlete_id", ids).gte("start_time", from).lte("start_time", to).limit(5000),
    supabase.from("planned_workouts").select("id, athlete_id, title, sport, scheduled_date").in("athlete_id", ids).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd),
    supabase.from("readiness_scores").select("athlete_id, date, overall").in("athlete_id", ids).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("workout_checkins").select("athlete_id, created_at, feel, rpe, pain").in("athlete_id", ids).gte("created_at", new Date(Date.parse(`${weekStart}T00:00:00Z`) - DAY).toISOString()).lte("created_at", to),
    supabase.from("races").select("athlete_id, name, race_date").in("athlete_id", ids).gt("race_date", weekEnd).lte("race_date", addDays(weekEnd, 21)).order("race_date"),
  ]);

  const athletes: DigestAthlete[] = (roster ?? []).map((a) => {
    const tz = a.timezone || "America/Chicago";
    const local = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
    const mine = (acts ?? []).filter((x) => x.athlete_id === a.id).map((x) => ({ ...x, day: local(x.start_time) }));
    const week = mine.filter((x) => x.day >= weekStart && x.day <= weekEnd);
    const real = week.filter((x) => (x.duration_s ?? 0) >= 600);
    const hours = Math.round((week.reduce((t, x) => t + (x.duration_s ?? 0), 0) / 3600) * 10) / 10;
    const before = mine.filter((x) => x.day >= addDays(weekStart, -28) && x.day < weekStart);
    const usualHours = before.length ? Math.round((before.reduce((t, x) => t + (x.duration_s ?? 0), 0) / 3600 / 4) * 10) / 10 : null;

    const plans = (planned ?? []).filter((p) => p.athlete_id === a.id);
    const done = (p: (typeof plans)[number]) => week.some((x) => x.planned_workout_id === p.id || (x.day === p.scheduled_date && family(x.sport) === family(p.sport)));
    const missed = plans.filter((p) => !done(p) && p.scheduled_date <= weekEnd).map((p) => ({ title: p.title, date: p.scheduled_date }));

    const days = (readiness ?? []).filter((r) => r.athlete_id === a.id).sort((x, y) => x.date.localeCompare(y.date));
    const red = days.filter((r) => r.overall === "red").length;
    const yellow = days.filter((r) => r.overall === "yellow").length;

    const ck = (checkins ?? []).filter((c) => c.athlete_id === a.id && local(c.created_at) >= weekStart && local(c.created_at) <= weekEnd);
    const painMap = new Map<string, number>();
    for (const c of ck) for (const [spot, lvl] of Object.entries((c.pain ?? {}) as Record<string, number>)) if (lvl >= 2) painMap.set(spot, Math.max(painMap.get(spot) ?? 0, lvl));
    const pain = [...painMap].map(([spot, lvl]) => `${spotLabel(spot as Spot).toLowerCase()} (${lvl >= 3 ? "severe" : "moderate"})`);
    const avg = (v: (number | null)[]) => {
      const n = v.filter((x): x is number => typeof x === "number");
      return n.length ? Math.round((n.reduce((t, x) => t + x, 0) / n.length) * 10) / 10 : null;
    };
    const r = (races ?? []).find((x) => x.athlete_id === a.id);

    const attention: string[] = [];
    if (pain.length) attention.push(`Reported pain: ${pain.join(", ")}`);
    if (red >= 2) attention.push(`Red readiness ${red} days`);
    if (missed.length >= 2) attention.push(`Missed ${missed.length} of ${plans.length} planned workouts`);
    if (plans.length && !week.length) attention.push("No workouts synced this week");
    if (usualHours && usualHours >= 1 && hours > usualHours * 1.5) attention.push(`Big jump: ${hours} h vs usual ${usualHours} h`);
    if (usualHours && usualHours >= 2 && hours < usualHours * 0.5 && week.length) attention.push(`Much lighter week: ${hours} h vs usual ${usualHours} h`);

    return {
      id: a.id,
      name: a.full_name || a.email || "Athlete",
      planned: plans.length,
      completed: plans.length - missed.length,
      missed,
      hours,
      sessions: real.length,
      usualHours,
      red,
      yellow,
      latest: (days.at(-1)?.overall as Flag | undefined) ?? null,
      pain,
      feel: avg(ck.map((c) => c.feel)),
      rpe: avg(ck.map((c) => c.rpe)),
      race: r ? { name: r.name, date: r.race_date, days: Math.round((Date.parse(r.race_date) - Date.parse(weekEnd)) / DAY) } : null,
      attention,
    };
  });

  athletes.sort((x, y) => y.attention.length - x.attention.length || x.name.localeCompare(y.name));
  return {
    weekStart,
    weekEnd,
    team: {
      hours: Math.round(athletes.reduce((t, a) => t + a.hours, 0) * 10) / 10,
      sessions: athletes.reduce((t, a) => t + a.sessions, 0),
      planned: athletes.reduce((t, a) => t + a.planned, 0),
      completed: athletes.reduce((t, a) => t + a.completed, 0),
    },
    athletes,
  };
}

/** One line for the Monday notification. */
export function digestLine(d: Digest) {
  const look = d.athletes.filter((a) => a.attention.length);
  const done = d.team.planned ? `${d.team.completed}/${d.team.planned} planned workouts done` : `${d.team.sessions} sessions`;
  return `${done}, ${d.team.hours} h trained. ${look.length ? `${look.length} to look at: ${look.slice(0, 3).map((a) => a.name.split(" ")[0]).join(", ")}${look.length > 3 ? "…" : ""}.` : "Nobody flagged."}`;
}
