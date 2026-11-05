import type { SupabaseClient } from "@supabase/supabase-js";

import { sportLabel } from "@/lib/activity/format";

import type { WorkoutRef } from "./types";

const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Resolve linked workouts to chips. Row-level security drops any the viewer can't see. */
export async function loadRefs(supabase: SupabaseClient, activityIds: string[], plannedIds: string[], timeZone: string) {
  const out: Record<string, WorkoutRef> = {};
  const [{ data: acts }, { data: plans }] = await Promise.all([
    activityIds.length ? supabase.from("activities").select("id, name, sport, start_time").in("id", activityIds) : Promise.resolve({ data: [] }),
    plannedIds.length ? supabase.from("planned_workouts").select("id, title, sport, scheduled_date").in("id", plannedIds) : Promise.resolve({ data: [] }),
  ]);
  for (const a of acts ?? [])
    out[a.id] = {
      kind: "activity",
      id: a.id,
      title: a.name || sportLabel(a.sport),
      sport: a.sport,
      date: new Date(a.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone }),
    };
  for (const w of plans ?? []) out[w.id] = { kind: "planned", id: w.id, title: w.title, sport: w.sport, date: short(new Date(`${w.scheduled_date}T12:00:00`)) };
  return out;
}
