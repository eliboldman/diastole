import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateStrain, strainFromSets, type StrengthSet, type Strain } from "@/lib/avatar/strain";

type Act = {
  id: string;
  athlete_id: string;
  sport: string | null;
  duration_s: number | null;
  distance_m: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  training_load: number | null;
};

const ACT_COLS = "id, athlete_id, sport, duration_s, distance_m, elevation_gain_m, avg_hr, training_load";

/** The dominant swim stroke from the laps (by distance). */
function dominantStroke(laps: unknown): string | null {
  if (!Array.isArray(laps)) return null;
  const by = new Map<string, number>();
  for (const l of laps as { stroke?: string | null; distance_m?: number | null }[]) if (l.stroke && l.distance_m) by.set(l.stroke, (by.get(l.stroke) ?? 0) + l.distance_m);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** The estimate for one workout: logged strength sets when there are any, else the sport pattern x demand. */
export function autoStrain(a: Act, extra: { sets?: StrengthSet[] | null; laps?: unknown; maxHr?: number | null }): Strain {
  if (extra.sets?.length) {
    const fromSets = strainFromSets(extra.sets);
    if (Object.keys(fromSets).length) return fromSets;
  }
  return estimateStrain({
    sport: a.sport,
    duration_s: a.duration_s,
    distance_m: a.distance_m,
    elevation_gain_m: a.elevation_gain_m,
    avg_hr: a.avg_hr,
    max_hr_athlete: extra.maxHr ?? null,
    training_load: a.training_load,
    swim_stroke: dominantStroke(extra.laps),
  });
}

async function maxHrOf(admin: SupabaseClient, athleteId: string) {
  const { data } = await admin.from("athlete_zones").select("max_hr").eq("athlete_id", athleteId).maybeSingle();
  return data?.max_hr ?? 190;
}

/** (Re)write the estimate for a workout. The athlete's own map ("custom") is never touched. */
export async function writeAutoStrain(admin: SupabaseClient, activityId: string, extra: { sets?: StrengthSet[] | null; laps?: unknown } = {}) {
  const { data: a } = await admin.from("activities").select(ACT_COLS).eq("id", activityId).maybeSingle<Act>();
  if (!a) return;
  const auto = autoStrain(a, { ...extra, maxHr: await maxHrOf(admin, a.athlete_id) });
  await admin.from("activity_strain").upsert({ activity_id: a.id, athlete_id: a.athlete_id, auto, updated_at: new Date().toISOString() }, { onConflict: "activity_id" });
}

/** Give recent workouts without an estimate one (summary-only syncs, imports). */
export async function backfillStrain(admin: SupabaseClient, athleteId: string, days = 4) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: acts } = await admin.from("activities").select(`${ACT_COLS}, activity_strain(activity_id), activity_details(laps, strength_sets)`).eq("athlete_id", athleteId).gte("start_time", since);
  const missing = (acts ?? []).filter((a) => !(a.activity_strain as unknown as unknown[] | null)?.length && !(a.activity_strain as unknown as { activity_id?: string } | null)?.activity_id);
  if (!missing.length) return;
  const maxHr = await maxHrOf(admin, athleteId);
  const rows = missing.map((a) => {
    const d = (Array.isArray(a.activity_details) ? a.activity_details[0] : a.activity_details) as { laps?: unknown; strength_sets?: StrengthSet[] | null } | null;
    return { activity_id: a.id, athlete_id: a.athlete_id, auto: autoStrain(a as Act, { sets: d?.strength_sets, laps: d?.laps, maxHr }) };
  });
  await admin.from("activity_strain").upsert(rows, { onConflict: "activity_id", ignoreDuplicates: true });
}
