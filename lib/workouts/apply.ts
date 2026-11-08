import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { approveAndSend } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { retireWorkout } from "@/lib/workouts/retire";
import type { Sport, Step } from "@/lib/workouts/garmin-format";
import { validateSteps } from "@/lib/workouts/garmin-format";

// Applies a "Life happened" / return-to-training change with the service role. Callers check who
// may do it first (the athlete for small changes, the coach on approval). Watches are updated the
// same way the coach's edits are.

export type ChangeProposal =
  | { action: "steps"; steps: Step[] }
  | { action: "move"; date: string }
  | { action: "skip" }
  | { action: "ramp"; workouts: { date: string; title: string; sport: Sport; steps: Step[] }[] };

type Row = { id: string; athlete_id: string; title: string; sport: string; scheduled_date: string; description: string | null; steps: Step[]; status: string; pool_length: number | null; pool_unit: string | null };

async function snapshot(admin: SupabaseClient, w: Row, change: string, by: string) {
  const { data: last } = await admin.from("workout_versions").select("version").eq("workout_id", w.id).order("version", { ascending: false }).limit(1).maybeSingle();
  await admin.from("workout_versions").insert({
    workout_id: w.id,
    version: (last?.version ?? 0) + 1,
    change,
    title: w.title,
    sport: w.sport,
    scheduled_date: w.scheduled_date,
    description: w.description,
    steps: w.steps,
    pool_length: w.pool_length,
    pool_unit: w.pool_unit,
    created_by: by,
  });
}

async function resync(admin: SupabaseClient, w: Row) {
  if (w.status !== "sent") return;
  const { data: d } = await admin.from("device_connections").select("source").eq("athlete_id", w.athlete_id).maybeSingle();
  // Apple picks changes up at its next sync from the database.
  if (d?.source === "garmin") await resendWorkoutToGarmin(w.id);
}

/** Apply to one workout. Returns an error message, or null when done. */
export async function applyToWorkout(admin: SupabaseClient, workoutId: string, p: Exclude<ChangeProposal, { action: "ramp" }>, by: string, label: string): Promise<string | null> {
  const { data } = await admin.from("planned_workouts").select("id, athlete_id, title, sport, scheduled_date, description, steps, status, pool_length, pool_unit, deleted_at").eq("id", workoutId).maybeSingle();
  if (!data || data.deleted_at) return "That workout is gone.";
  const w = data as Row;
  if (w.status === "completed") return "That workout is already done.";

  if (p.action === "skip") {
    // Past and never on a watch: just mark it skipped. Otherwise take it off the plan and the watch.
    if (w.status !== "sent" && w.scheduled_date < new Date().toISOString().slice(0, 10)) {
      await admin.from("planned_workouts").update({ status: "skipped" }).eq("id", w.id);
      return null;
    }
    const r = await retireWorkout(admin as never, w.id);
    return r.ok ? null : (r.error ?? "Couldn't take it off the watch.");
  }
  if (p.action === "steps") {
    const errors = validateSteps(p.steps, 0, w.sport as Sport, w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "METER" } : null);
    if (errors.length) return errors[0];
    await admin.from("planned_workouts").update({ steps: p.steps }).eq("id", w.id);
    const updated = { ...w, steps: p.steps };
    await snapshot(admin, updated, label, by);
    await resync(admin, updated).catch(() => {});
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return "Bad date.";
  await admin.from("planned_workouts").update({ scheduled_date: p.date }).eq("id", w.id);
  const updated = { ...w, scheduled_date: p.date };
  await snapshot(admin, updated, `${label} (moved from ${w.scheduled_date})`, by);
  await resync(admin, updated).catch(() => {});
  return null;
}

/** A return ramp, approved by the coach: clear the athlete's plan over those days and send the ramp. Runs as the coach. */
export async function applyRamp(admin: SupabaseClient, athleteId: string, workouts: { date: string; title: string; sport: Sport; steps: Step[] }[]): Promise<string | null> {
  if (!workouts.length) return null;
  const dates = workouts.map((w) => w.date).sort();
  const { data: clash } = await admin.from("planned_workouts").select("id").eq("athlete_id", athleteId).is("deleted_at", null).gte("scheduled_date", dates[0]).lte("scheduled_date", dates[dates.length - 1]).neq("status", "completed");
  for (const c of clash ?? []) await retireWorkout(admin as never, c.id).catch(() => {});
  for (const w of workouts) {
    const r = await approveAndSend({ athleteId, title: w.title, sport: w.sport, scheduledDate: w.date, description: "Easing back in after time off.", steps: w.steps, pool: null });
    if (!r.ok) return r.error;
  }
  return null;
}
