import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { annotate, resolve, stripRel, type RelZones } from "@/lib/workouts/relative";

/**
 * New zones: upcoming workouts not yet on a watch get their targets re-worked, keeping the same
 * percentage of the athlete's zones (e.g. 90% of FTP stays 90% of the new FTP). Ones already sent
 * keep their numbers until re-sent.
 */
export async function rescaleUpcoming(supabase: SupabaseClient, athleteId: string, before: RelZones, after: RelZones): Promise<string | undefined> {
  if (!before) return undefined;
  const changedZone = (["ftp_w", "threshold_speed_mps", "threshold_hr", "max_hr", "css_sec_per_100m"] as const).some((k) => Number(before[k] ?? 0) !== Number(after?.[k] ?? 0));
  if (!changedZone) return undefined;
  const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from("planned_workouts")
    .select("id, steps, status, external_id, sport, pool_length, pool_unit")
    .eq("athlete_id", athleteId)
    .is("deleted_at", null)
    .in("status", ["draft", "approved", "sent"])
    .gte("scheduled_date", today);
  let updated = 0;
  let onWatch = 0;
  for (const r of rows ?? []) {
    // Percentages from the current numbers and the old zones, then numbers from the new zones.
    const pool: Pool = r.sport === "swim" && r.pool_length && r.pool_unit ? { length: Number(r.pool_length), unit: r.pool_unit as PoolUnit } : null;
    const scaled = resolve(annotate(stripRel((r.steps ?? []) as Step[]), before, pool), after, pool);
    if (!scaled.changed) continue;
    if (r.status === "sent" || r.external_id) {
      onWatch++;
      continue;
    }
    const steps = annotate(stripRel(scaled.steps), after, pool);
    const { error } = await supabase.from("planned_workouts").update({ steps }).eq("id", r.id).in("status", ["draft", "approved"]);
    if (!error) updated++;
  }
  const parts = [
    updated ? `Updated targets on ${updated} upcoming ${updated === 1 ? "workout" : "workouts"}.` : null,
    onWatch ? `${onWatch} already on the watch ${onWatch === 1 ? "keeps its" : "keep their"} old targets until re-sent.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
