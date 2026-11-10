import type { SupabaseClient } from "@supabase/supabase-js";

import { suggestZones, type Effort, type Suggestion } from "./zone-suggest";

const WINDOW_DAYS = 60;

/** Zone suggestions per athlete from the last 60 days (caller's client; row-level security applies). */
export async function getZoneSuggestions(supabase: SupabaseClient, athleteIds: string[]): Promise<Map<string, Suggestion[]>> {
  const out = new Map<string, Suggestion[]>();
  if (!athleteIds.length) return out;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: zones }, { data: acts }] = await Promise.all([
    supabase.from("athlete_zones").select("athlete_id, ftp_w, threshold_speed_mps, max_hr, dismissed").in("athlete_id", athleteIds),
    supabase.from("activities").select("id, athlete_id, start_time, max_hr").in("athlete_id", athleteIds).gte("start_time", since).limit(3000),
  ]);
  const ids = (acts ?? []).map((a) => a.id as string);
  const bests = new Map<string, Effort["bests"]>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("activity_details").select("activity_id, bests").in("activity_id", ids.slice(i, i + 300)).not("bests", "is", null);
    for (const d of data ?? []) bests.set(d.activity_id as string, d.bests as Effort["bests"]);
  }
  for (const id of athleteIds) {
    const z = (zones ?? []).find((x) => x.athlete_id === id) ?? null;
    const efforts: Effort[] = (acts ?? []).filter((a) => a.athlete_id === id).map((a) => ({ activity_id: a.id, start_time: a.start_time, max_hr: a.max_hr, bests: bests.get(a.id) ?? null }));
    const s = suggestZones(z, efforts);
    if (s.length) out.set(id, s);
  }
  return out;
}
