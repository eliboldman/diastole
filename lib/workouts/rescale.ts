import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import type { Brick, Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { annotate, resolve, stripRel, type RelZones } from "@/lib/workouts/relative";

/**
 * New zones: upcoming workouts get their targets re-worked, keeping the same percentage of the
 * athlete's zones (e.g. 90% of FTP stays 90% of the new FTP), brick runs included. Ones already on a
 * watch keep their numbers until re-sent, except sessions from an imported plan (plan_meta), which
 * the athlete runs on autopilot: those update and re-send to Garmin straight away.
 */
export async function rescaleUpcoming(supabase: SupabaseClient, athleteId: string, before: RelZones, after: RelZones): Promise<string | undefined> {
  if (!before) return undefined;
  const changedZone = (["ftp_w", "threshold_speed_mps", "threshold_hr", "max_hr", "css_sec_per_100m"] as const).some((k) => Number(before[k] ?? 0) !== Number(after?.[k] ?? 0));
  if (!changedZone) return undefined;
  const today = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await supabase
    .from("planned_workouts")
    .select("id, steps, brick, status, external_id, sport, pool_length, pool_unit, plan_meta")
    .eq("athlete_id", athleteId)
    .is("deleted_at", null)
    .in("status", ["draft", "approved", "sent"])
    .gte("scheduled_date", today);
  let updated = 0;
  let onWatch = 0;
  let resent = 0;
  const rework = (steps: Step[], pool: Pool) => {
    // Percentages from the current numbers and the old zones, then numbers from the new zones.
    const scaled = resolve(annotate(stripRel(steps), before, pool), after, pool);
    return { changed: scaled.changed, steps: annotate(stripRel(scaled.steps), after, pool) };
  };
  for (const r of rows ?? []) {
    const pool: Pool = r.sport === "swim" && r.pool_length && r.pool_unit ? { length: Number(r.pool_length), unit: r.pool_unit as PoolUnit } : null;
    const main = rework((r.steps ?? []) as Step[], pool);
    const brick = r.brick ? rework(((r.brick as Exclude<Brick, null>).steps ?? []) as Step[], null) : null;
    if (!main.changed && !brick?.changed) continue;
    const patch = { steps: main.steps, ...(brick ? { brick: { ...(r.brick as object), steps: brick.steps } } : {}) };
    const sentAlready = r.status === "sent" || r.external_id;
    if (sentAlready && !r.plan_meta) {
      onWatch++;
      continue;
    }
    const { error } = await supabase.from("planned_workouts").update(patch).eq("id", r.id);
    if (error) continue;
    updated++;
    if (sentAlready && r.external_id) {
      try {
        await resendWorkoutToGarmin(r.id);
        resent++;
      } catch (e) {
        console.error("rescale: resend failed", r.id, e);
      }
    }
  }
  const parts = [
    updated ? `Updated targets on ${updated} upcoming ${updated === 1 ? "workout" : "workouts"}.` : null,
    resent ? `${resent} re-sent to the watch.` : null,
    onWatch ? `${onWatch} already on the watch ${onWatch === 1 ? "keeps its" : "keep their"} old targets until re-sent.` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}
