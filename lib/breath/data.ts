// Loads what the Breathe pages need: the athlete's sessions, holds, pace, and today's context.
import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PACE, type DayContext, type Kind, type NightRow, type SessionRow } from "@/lib/breath/plan";
import { dominantFamily, familyOf, oneFamily } from "@/lib/readiness/source";

const shift = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const HARD_LOAD = 100; // a session's training load (TRIMP-like) that counts as hard

export async function breathData(supabase: SupabaseClient, athleteId: string, today: string, tz: string) {
  const since = shift(today, -90);
  const [{ data: sessions }, { data: holds }, { data: wellness }, { data: ready }, { data: acts }, { data: races }] = await Promise.all([
    supabase.from("breath_sessions").select("id, kind, pace, seconds, calm_before, calm_after, local_date, local_hour, created_at, hr_start, hr_end, hr_swing, rmssd").eq("athlete_id", athleteId).gte("local_date", since).order("created_at", { ascending: false }).limit(500),
    supabase.from("breath_holds").select("id, taken_on, seconds").eq("athlete_id", athleteId).order("taken_on", { ascending: true }).limit(200),
    supabase.from("daily_wellness").select("date, source, hrv_ms, resting_hr").eq("athlete_id", athleteId).gte("date", since).order("date"),
    supabase.from("readiness_scores").select("overall").eq("athlete_id", athleteId).eq("date", today).maybeSingle(),
    supabase.from("activities").select("start_time, duration_s, training_load").eq("athlete_id", athleteId).gte("start_time", new Date(Date.now() - 36 * 3_600_000).toISOString()),
    supabase.from("races").select("race_date").eq("athlete_id", athleteId).gte("race_date", today).lte("race_date", shift(today, 1)),
  ]);

  const rows = (sessions ?? []) as (SessionRow & { id: string; pace: number | null; seconds: number; created_at: string; hr_start: number | null; hr_end: number | null; hr_swing: number | null; rmssd: number | null })[];
  const lastFinder = rows.find((s) => s.kind === "finder" && s.pace != null);
  const pace = lastFinder ? Number(lastFinder.pace) : null;

  // One wearable's numbers only (Garmin RMSSD and Apple SDNN never mix).
  const w = (wellness ?? []) as { date: string; source: string; hrv_ms: number | null; resting_hr: number | null }[];
  const family = w.length ? dominantFamily(w) : familyOf(null);
  const nights: NightRow[] = oneFamily(w, family).map((r) => ({ date: r.date, hrv_ms: r.hrv_ms, resting_hr: r.resting_hr }));

  const todays = (acts ?? []).filter((a) => new Date(a.start_time).toLocaleDateString("en-CA", { timeZone: tz }) === today);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date())) % 24;
  const context: DayContext = {
    hour,
    readiness: ((ready?.overall as string) ?? null) as DayContext["readiness"],
    trainedMinutes: Math.round(todays.reduce((a, x) => a + (x.duration_s ?? 0), 0) / 60),
    hardToday: todays.some((a) => Number(a.training_load) >= HARD_LOAD),
    raceToday: (races ?? []).some((r) => r.race_date === today),
    raceTomorrow: (races ?? []).some((r) => r.race_date === shift(today, 1)),
    doneToday: rows.filter((s) => s.local_date === today).map((s) => s.kind as Kind),
  };

  return { sessions: rows, holds: (holds ?? []) as { id: string; taken_on: string; seconds: number }[], nights, pace, effectivePace: pace ?? DEFAULT_PACE, context };
}

/** Just the athlete's pace (latest finder), for the player. */
export async function breathPace(supabase: SupabaseClient, athleteId: string): Promise<number | null> {
  const { data } = await supabase.from("breath_sessions").select("pace").eq("athlete_id", athleteId).eq("kind", "finder").not("pace", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.pace != null ? Number(data.pace) : null;
}
