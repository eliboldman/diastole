import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanWeek, type WeekPrefs } from "@/lib/week-prefs";

import { bedtimeFor, consistency, DEFAULT_PREFS, defaultGoal, nudgesFor, startMin, zonedInstant, type Bedtime, type Night, type SleepPrefs } from "./bedtime";

const DAYMS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAYMS).toISOString().slice(0, 10);
export const localDate = (tz: string, at = new Date()) => at.toLocaleDateString("en-CA", { timeZone: tz });
const localHHMM = (tz: string, at: Date) => at.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });

export type SleepSetup = { prefs: SleepPrefs; goalMin: number; dataGoalMin: number; goalFromData: boolean; week: WeekPrefs; saved: boolean };

/** Settings with defaults: the sleep goal falls back to their own last 30 nights. */
export async function getSleepSetup(supabase: SupabaseClient, athleteId: string): Promise<SleepSetup> {
  const [{ data: row }, { data: wk }, { data: nights }] = await Promise.all([
    supabase.from("athlete_sleep").select("wake_time, sleep_goal_min, buffer_min, nudges, quiet_start, quiet_end, wind_down").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_week").select("days").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("daily_wellness").select("sleep_seconds").eq("athlete_id", athleteId).gte("date", new Date(Date.now() - 30 * DAYMS).toISOString().slice(0, 10)).not("sleep_seconds", "is", null),
  ]);
  const prefs: SleepPrefs = row
    ? { ...DEFAULT_PREFS, ...row, wake_time: row.wake_time ? String(row.wake_time).slice(0, 5) : null, quiet_start: String(row.quiet_start).slice(0, 5), quiet_end: String(row.quiet_end).slice(0, 5) }
    : DEFAULT_PREFS;
  const fromData = defaultGoal((nights ?? []).map((n) => n.sleep_seconds));
  return { prefs, goalMin: prefs.sleep_goal_min ?? fromData, dataGoalMin: fromData, goalFromData: !prefs.sleep_goal_min, week: cleanWeek(wk?.days), saved: Boolean(row) };
}

async function nextDayPlans(supabase: SupabaseClient, athleteId: string, from: string, to: string) {
  const { data } = await supabase
    .from("planned_workouts")
    .select("scheduled_date, title, sport, start_time")
    .eq("athlete_id", athleteId)
    .is("deleted_at", null)
    .neq("status", "draft")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  return data ?? [];
}

/** Tonight's bedtime for Today (null when there's nothing to work back from). */
export async function getTonight(supabase: SupabaseClient, athleteId: string, tz: string): Promise<{ bedtime: Bedtime | null; setup: SleepSetup; tomorrow: string }> {
  const setup = await getSleepSetup(supabase, athleteId);
  const tomorrow = addDays(localDate(tz), 1);
  const plans = await nextDayPlans(supabase, athleteId, tomorrow, tomorrow);
  return { bedtime: bedtimeFor({ tomorrow, plans, week: setup.week, prefs: setup.prefs, goalMin: setup.goalMin }), setup, tomorrow };
}

export type ScheduledNudge = { id: string; date: string; at: string; title: string; body: string };

/** The next `nights` evenings of nudges as exact instants, for the iPhone app to schedule. */
export async function getSchedule(supabase: SupabaseClient, athleteId: string, tz: string, nights = 7): Promise<{ enabled: boolean; nudges: ScheduledNudge[] }> {
  const setup = await getSleepSetup(supabase, athleteId);
  if (!setup.prefs.nudges) return { enabled: false, nudges: [] };
  const today = localDate(tz);
  const plans = await nextDayPlans(supabase, athleteId, addDays(today, 1), addDays(today, nights));
  const now = Date.now();
  const out: ScheduledNudge[] = [];
  for (let i = 0; i < nights; i++) {
    const night = addDays(today, i);
    const tomorrow = addDays(night, 1);
    const b = bedtimeFor({ tomorrow, plans: plans.filter((p) => p.scheduled_date === tomorrow), week: setup.week, prefs: setup.prefs, goalMin: setup.goalMin });
    if (!b) continue;
    for (const n of nudgesFor(b, setup.prefs)) {
      const at = zonedInstant(night, n.atMin, tz);
      if (at.getTime() <= now + 60_000) continue;
      out.push({ id: `bedtime.${night}.${n.kind}`, date: night, at: at.toISOString(), title: n.title, body: n.body });
    }
  }
  return { enabled: true, nudges: out };
}

/** The last `days` nights: target bedtime (from the next day's plan, as it stands) and actual sleep start. */
export async function getConsistency(supabase: SupabaseClient, athleteId: string, tz: string, days = 14): Promise<{ nights: (Night & { tomorrow: string })[]; hit: number; total: number }> {
  const setup = await getSleepSetup(supabase, athleteId);
  const today = localDate(tz);
  const first = addDays(today, -days);
  const [plans, { data: well }] = await Promise.all([
    nextDayPlans(supabase, athleteId, addDays(first, 1), today),
    supabase.from("daily_wellness").select("date, sleep_start").eq("athlete_id", athleteId).gte("date", addDays(first, 1)).lte("date", today).not("sleep_start", "is", null),
  ]);
  const nights: (Night & { tomorrow: string })[] = [];
  for (let i = days; i >= 1; i--) {
    const night = addDays(today, -i);
    const tomorrow = addDays(night, 1);
    const b = bedtimeFor({ tomorrow, plans: plans.filter((p) => p.scheduled_date === tomorrow), week: setup.week, prefs: setup.prefs, goalMin: setup.goalMin });
    // The wellness row is dated by the morning (tomorrow); its sleep began the evening before.
    const w = (well ?? []).find((x) => x.date === tomorrow);
    const start = w?.sleep_start ? new Date(w.sleep_start) : null;
    nights.push({ date: night, tomorrow, targetMin: b?.bedtimeMin ?? null, sleepStartMin: start ? startMin(night, localDate(tz, start), localHHMM(tz, start)) : null });
  }
  return { nights, ...consistency(nights) };
}
