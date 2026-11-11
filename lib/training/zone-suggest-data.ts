import type { SupabaseClient } from "@supabase/supabase-js";

import type { Lap, Streams } from "@/lib/activity/fit";

import { analyzeTest, detectTest, mergeWithTests, suggestFromTests, type DoneTest } from "./tests";
import { suggestZones, type Effort, type Suggestion } from "./zone-suggest";

const WINDOW_DAYS = 60;

/** Zone suggestions per athlete from the last 60 days (caller's client; row-level security applies). */
export async function getZoneSuggestions(supabase: SupabaseClient, athleteIds: string[]): Promise<Map<string, Suggestion[]>> {
  const out = new Map<string, Suggestion[]>();
  if (!athleteIds.length) return out;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: zones }, { data: acts }] = await Promise.all([
    supabase.from("athlete_zones").select("athlete_id, ftp_w, threshold_speed_mps, max_hr, css_sec_per_100m, dismissed").in("athlete_id", athleteIds),
    supabase.from("activities").select("id, athlete_id, start_time, max_hr, sport, name, planned_workouts(test_kind)").in("athlete_id", athleteIds).gte("start_time", since).limit(3000),
  ]);
  const ids = (acts ?? []).map((a) => a.id as string);
  const bests = new Map<string, Effort["bests"]>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("activity_details").select("activity_id, bests").in("activity_id", ids.slice(i, i + 300)).not("bests", "is", null);
    for (const d of data ?? []) bests.set(d.activity_id as string, d.bests as Effort["bests"]);
  }
  // Threshold tests: the planned test an activity completed, or a name like "FTP test". Only their files are read.
  const tests = (acts ?? [])
    .map((a) => {
      const pw = (Array.isArray(a.planned_workouts) ? a.planned_workouts[0] : a.planned_workouts) as { test_kind?: string | null } | null;
      return { a, kind: detectTest({ name: a.name, sport: a.sport, planned_test: pw?.test_kind ?? null }) };
    })
    .filter((x) => x.kind);
  const done = new Map<string, DoneTest[]>();
  if (tests.length) {
    const { data: files } = await supabase.from("activity_details").select("activity_id, streams, laps").in("activity_id", tests.map((x) => x.a.id));
    for (const { a, kind } of tests) {
      const f = files?.find((x) => x.activity_id === a.id);
      const result = f ? analyzeTest(kind!, { streams: f.streams as Streams, laps: f.laps as Lap[] }) : null;
      if (result) done.set(a.athlete_id, [...(done.get(a.athlete_id) ?? []), { activity_id: a.id, start_time: a.start_time, result }]);
    }
  }
  for (const id of athleteIds) {
    const z = (zones ?? []).find((x) => x.athlete_id === id) ?? null;
    const efforts: Effort[] = (acts ?? []).filter((a) => a.athlete_id === id).map((a) => ({ activity_id: a.id, start_time: a.start_time, sport: a.sport, max_hr: a.max_hr, bests: bests.get(a.id) ?? null }));
    const s = mergeWithTests<Suggestion>(suggestZones(z, efforts), suggestFromTests(z as Parameters<typeof suggestFromTests>[0], done.get(id) ?? []));
    if (s.length) out.set(id, s);
  }
  return out;
}
