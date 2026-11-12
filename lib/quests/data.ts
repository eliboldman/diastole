// Today's rest day quests for one athlete (server only).
import type { SupabaseClient } from "@supabase/supabase-js";

import { autoDone, isRestDay, questsFor, type CustomQuest, type Quest } from "@/lib/quests/quests";
import { createAdminClient } from "@/lib/supabase/server";

export type TodayQuest = Quest & { done: boolean; byWatch: boolean };
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Whether today is a rest day, and its quests. Uses the athlete's own client (row-level security applies). */
export async function getRestDay(supabase: SupabaseClient, athleteId: string, today: string, timeZone: string) {
  const [{ data: plans }, { data: prof }] = await Promise.all([
    supabase.from("planned_workouts").select("scheduled_date").eq("athlete_id", athleteId).is("deleted_at", null).in("status", ["approved", "sent", "completed"]).gte("scheduled_date", addDays(today, -7)).lte("scheduled_date", addDays(today, 7)),
    supabase.from("profiles").select("health_pause").eq("id", athleteId).maybeSingle(),
  ]);
  const plannedToday = (plans ?? []).filter((p) => p.scheduled_date === today).length;
  if (!isRestDay({ plannedToday, plannedNearby: (plans ?? []).length, paused: Boolean(prof?.health_pause) })) return null;
  return loadQuests(supabase, athleteId, today, timeZone);
}

export async function loadQuests(supabase: SupabaseClient, athleteId: string, today: string, timeZone: string) {
  const dayStart = new Date(Date.parse(`${addDays(today, -1)}T00:00:00Z`)).toISOString();
  const [{ data: custom }, { data: done }, { data: acts }, { data: rec }] = await Promise.all([
    supabase.from("rest_quests").select("id, title, blurb, grit, athlete_id, created_at").eq("active", true),
    supabase.from("quest_completions").select("quest_key, auto").eq("athlete_id", athleteId).eq("date", today),
    supabase.from("activities").select("start_time, sport, duration_s").eq("athlete_id", athleteId).gte("start_time", dayStart),
    supabase.from("recovery_sessions").select("completed_at").eq("athlete_id", athleteId).gte("completed_at", dayStart),
  ]);
  const local = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
  const walkMinutes = (acts ?? []).filter((a) => local(a.start_time) === today && /walk|hik/i.test(a.sport ?? "")).reduce((m, a) => m + (a.duration_s ?? 0) / 60, 0);
  const recoveryDone = (rec ?? []).some((r) => local(r.completed_at) === today);
  const quests = questsFor(athleteId, today, (custom ?? []) as CustomQuest[]);
  const doneKeys = new Map((done ?? []).map((d) => [d.quest_key as string, Boolean(d.auto)]));

  // Quests the watch or a recovery routine already covered: record them (once).
  const fresh = quests.filter((q) => !doneKeys.has(q.key) && autoDone(q, { walkMinutes, recoveryDone }));
  if (fresh.length) {
    await createAdminClient()
      .from("quest_completions")
      .upsert(fresh.map((q) => ({ athlete_id: athleteId, date: today, quest_key: q.key, title: q.title.slice(0, 60), grit: q.grit, auto: true })), { onConflict: "athlete_id,date,quest_key", ignoreDuplicates: true });
    for (const q of fresh) doneKeys.set(q.key, true);
  }
  return quests.map((q): TodayQuest => ({ ...q, done: doneKeys.has(q.key), byWatch: doneKeys.get(q.key) ?? false }));
}
