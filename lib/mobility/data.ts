import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { dayIn } from "@/lib/calendar";
import { cleanAnswers, dailyFlow, priorities, score, type Answers, type DayKind, type Priority, type Result, type Sport } from "@/lib/mobility/screen";
import type { RoutineItem } from "@/lib/recovery/catalog";

export type Screen = { id: string; taken_on: string; score: number; answers: Answers; results: Result[] };

/** The athlete's screens, newest first. Row-level security limits this to the athlete and their head coach. */
export async function screensFor(supabase: SupabaseClient, athleteId: string, limit = 12): Promise<Screen[]> {
  const { data } = await supabase.from("mobility_screens").select("id, taken_on, score, answers").eq("athlete_id", athleteId).order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).flatMap((s) => {
    const answers = cleanAnswers(s.answers);
    return answers ? [{ id: s.id, taken_on: s.taken_on, score: s.score, answers, results: score(answers) }] : [];
  });
}

/** Share of training time per sport over four weeks either side of today, from the calendar. */
export async function sportMix(supabase: SupabaseClient, athleteId: string, today: string): Promise<Partial<Record<Sport, number>>> {
  const shift = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("planned_workouts")
    .select("sport, plan_meta")
    .eq("athlete_id", athleteId)
    .is("deleted_at", null)
    .neq("status", "draft")
    .gte("scheduled_date", shift(-28))
    .lte("scheduled_date", shift(28))
    .limit(400);
  const mix: Partial<Record<Sport, number>> = {};
  for (const w of data ?? []) {
    const s = w.sport as Sport;
    if (s !== "swim" && s !== "bike" && s !== "run") continue;
    mix[s] = (mix[s] ?? 0) + (Number((w.plan_meta as { planned_duration_min?: number } | null)?.planned_duration_min) || 45);
  }
  return mix;
}

/** Before a session still to come today, after one that's done, or a day off. */
export async function dayKind(supabase: SupabaseClient, athleteId: string, today: string, timeZone: string): Promise<DayKind> {
  const [{ data: planned }, { data: done }] = await Promise.all([
    supabase.from("planned_workouts").select("id, status, sport").eq("athlete_id", athleteId).eq("scheduled_date", today).is("deleted_at", null).in("status", ["approved", "sent", "completed"]),
    supabase.from("activities").select("start_time, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", `${today}T00:00:00Z`).lte("start_time", new Date(Date.parse(`${today}T12:00:00Z`) + 36 * 3_600_000).toISOString()).limit(20),
  ]);
  const doneToday = (done ?? []).filter((a) => dayIn(a.start_time, timeZone) === today);
  const linked = new Set(doneToday.map((a) => a.planned_workout_id).filter(Boolean));
  const training = (planned ?? []).filter((w) => w.sport !== "strength");
  if (training.some((w) => w.status !== "completed" && !linked.has(w.id))) return "before";
  if (doneToday.length || training.length) return "after";
  return "rest";
}

export const DAY_WORDS: Record<DayKind, { title: string; sub: string }> = {
  before: { title: "Before today's session", sub: "Moving drills to warm up into, no long holds." },
  after: { title: "After training", sub: "Holds and drills while you're warm." },
  rest: { title: "Day off", sub: "A longer session for the areas you're working on." },
};

/** Today's mobility flow for the athlete, or null without a screen. */
export async function todaysFlow(
  supabase: SupabaseClient,
  athleteId: string,
  today: string,
  timeZone: string,
): Promise<{ screen: Screen; pri: Priority[]; day: DayKind; items: RoutineItem[] } | null> {
  const [screens, mix, day] = await Promise.all([screensFor(supabase, athleteId, 1), sportMix(supabase, athleteId, today), dayKind(supabase, athleteId, today, timeZone)]);
  const screen = screens[0];
  if (!screen) return null;
  const pri = priorities(screen.results, mix);
  return { screen, pri, day, items: dailyFlow(pri, day) };
}
