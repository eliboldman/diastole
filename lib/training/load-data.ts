import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateMaxHr } from "@/lib/activity/zones";
import type { Step } from "@/lib/workouts/garmin-format";

import { formBand, loadSeries, plannedLoad, rampRate, sessionLoad, type FormBand, type LoadDay, type LoadSource } from "./load";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export type LoadView = {
  today: string;
  days: LoadDay[]; // the shown window: SHOW_DAYS back through PLAN_DAYS ahead
  now: { fitness: number; fatigue: number; form: number; band: FormBand; ramp: number | null };
  sources: Record<LoadSource, number>; // sessions scored each way (last 90 days)
  sessions: number;
};

const WARMUP_DAYS = 90; // before the window, so the 42-day average settles
export const SHOW_DAYS = 90;
const PLAN_DAYS = 14;

/** One athlete's fitness/fatigue/form. Uses the caller's client (row-level security applies). */
export async function getLoad(supabase: SupabaseClient, athleteId: string, tz: string): Promise<LoadView | null> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const from = addDays(today, -(SHOW_DAYS + WARMUP_DAYS));
  const shownFrom = addDays(today, -SHOW_DAYS);
  const to = addDays(today, PLAN_DAYS);

  const [{ data: acts }, { data: zones }, { data: rhr }, { data: plans }] = await Promise.all([
    supabase
      .from("activities")
      .select("start_time, sport, duration_s, avg_hr, max_hr, avg_power, normalized_power, avg_speed_mps")
      .eq("athlete_id", athleteId)
      .gte("start_time", new Date(Date.parse(`${addDays(from, -1)}T00:00:00Z`)).toISOString())
      .order("start_time")
      .limit(2000),
    supabase.from("athlete_zones").select("ftp_w, threshold_speed_mps, threshold_hr, max_hr").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("daily_wellness").select("resting_hr").eq("athlete_id", athleteId).gte("date", addDays(today, -60)).not("resting_hr", "is", null).limit(60),
    supabase
      .from("planned_workouts")
      .select("scheduled_date, sport, steps")
      .eq("athlete_id", athleteId)
      .neq("status", "draft")
      .is("deleted_at", null)
      .gte("scheduled_date", today)
      .lte("scheduled_date", to),
  ]);
  if (!acts?.length) return null;

  const rest = rhr?.length ? [...rhr.map((r) => Number(r.resting_hr))].sort((a, b) => a - b)[Math.floor(rhr.length / 2)] : null;
  const ctx = {
    ftp: zones?.ftp_w ? Number(zones.ftp_w) : null,
    thresholdSpeed: zones?.threshold_speed_mps ? Number(zones.threshold_speed_mps) : null,
    thresholdHr: zones?.threshold_hr ? Number(zones.threshold_hr) : null,
    maxHr: zones?.max_hr ? Number(zones.max_hr) : estimateMaxHr(acts.map((a) => a.max_hr)),
    restingHr: rest,
  };

  const done = new Map<string, number>();
  const sources: Record<LoadSource, number> = { power: 0, pace: 0, hr: 0, time: 0 };
  let sessions = 0;
  let doneToday = false;
  for (const a of acts) {
    const day = new Date(a.start_time).toLocaleDateString("en-CA", { timeZone: tz });
    if (day < from || day > today) continue;
    const s = sessionLoad({ start_day: day, ...a }, ctx);
    done.set(day, (done.get(day) ?? 0) + s.load);
    if (day >= shownFrom) {
      sources[s.source]++;
      sessions++;
    }
    if (day === today) doneToday = true;
  }
  // Planned load from today on; today's plan only while nothing is done yet today.
  const planned = new Map<string, number>();
  for (const p of plans ?? []) {
    if (p.scheduled_date === today && doneToday) continue;
    planned.set(p.scheduled_date, (planned.get(p.scheduled_date) ?? 0) + plannedLoad((p.steps ?? []) as Step[], p.sport));
  }

  const all = loadSeries({ from, to, today, done, planned });
  const t = all.find((d) => d.date === today)!;
  // "Now" = end of today as it stands: fitness/fatigue after today's sessions, form for tomorrow.
  const fitness = t.fitness;
  const fatigue = t.fatigue;
  return {
    today,
    days: all.filter((d) => d.date >= shownFrom),
    now: { fitness, fatigue, form: Math.round(t.form), band: formBand(t.form), ramp: rampRate(all, today) },
    sources,
    sessions,
  };
}
