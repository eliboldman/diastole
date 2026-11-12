// A race's poster from the plan leading up to it (server). Caller's client: athlete or coach (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateSession } from "@/lib/fuel/plan";
import { isKey, posterState, windowStart, type KeySession, type PosterState } from "@/lib/poster/poster";
import type { Step } from "@/lib/workouts/garmin-format";

const family = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|walk|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : "other");

export async function getPoster(supabase: SupabaseClient, race: { athlete_id: string; race_date: string; created_at: string }, today: string): Promise<PosterState> {
  const from = windowStart(race.race_date, race.created_at);
  const [{ data: plans }, { data: acts }] = await Promise.all([
    supabase.from("planned_workouts").select("id, title, sport, scheduled_date, steps, status, mystery, revealed_at").eq("athlete_id", race.athlete_id).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", from).lt("scheduled_date", race.race_date).order("scheduled_date").limit(300),
    supabase.from("activities").select("id, sport, start_time, planned_workout_id").eq("athlete_id", race.athlete_id).gte("start_time", `${from}T00:00:00Z`).gte("duration_s", 600).limit(1000),
  ]);
  const keys: KeySession[] = [];
  for (const p of plans ?? []) {
    const est = estimateSession((p.steps ?? []) as Step[], p.sport);
    if (!isKey(est) && p.sport !== "strength") continue;
    if (p.sport === "strength") continue;
    const done = (acts ?? []).some((a) => a.planned_workout_id === p.id || (String(a.start_time).slice(0, 10) === p.scheduled_date && family(a.sport) === family(p.sport)));
    keys.push({ id: p.id, date: p.scheduled_date, title: p.mystery && !p.revealed_at && !done ? "Mystery session" : p.title, status: done ? "done" : p.status === "skipped" ? "excused" : "open" });
  }
  return posterState(keys, race.race_date, today);
}
