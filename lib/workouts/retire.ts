import "server-only";

import { removeWorkoutFromGarmin } from "@/lib/garmin/training";
import type { createClient } from "@/lib/supabase/server";

// Deleting a planned workout: soft delete (it lands in "Recently removed", with undo) and take it off
// the athlete's watch. Shared by the delete buttons and by anything that replaces a workout (an approved
// AI suggestion, or the coach sending an edited version of one), so a replaced session never lingers.

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = { id: string; athlete_id: string; status: string; external_id: string | null; deleted_at: string | null };

export async function removeFromDevice(supabase: Supa, w: Row) {
  const { data } = await supabase.from("device_connections").select("source").eq("athlete_id", w.athlete_id).maybeSingle();
  const device = (data?.source ?? null) as "garmin" | "apple" | null;
  if (w.status === "draft" || !device) return { removal_status: "removed", removal_error: null };
  if (device === "garmin") {
    if (!w.external_id) return { removal_status: "removed", removal_error: null };
    try {
      await removeWorkoutFromGarmin(w.id);
      return { removal_status: "pending_sync", removal_error: null };
    } catch (e) {
      return { removal_status: "failed", removal_error: (e as Error).message.slice(0, 300) };
    }
  }
  // Apple: the iOS app removes it from WorkoutKit on its next sync and marks it 'removed'.
  return { removal_status: "pending_sync", removal_error: null };
}

/** Row-level security limits this to the signed-in coach's own athletes. */
export async function retireWorkout(supabase: Supa, id: string): Promise<{ ok: boolean; athleteId?: string; error?: string }> {
  const { data } = await supabase.from("planned_workouts").select("id, athlete_id, status, external_id, deleted_at").eq("id", id).maybeSingle();
  const w = data as Row | null;
  if (!w) return { ok: false, error: "Workout not found." };
  if (w.deleted_at) return { ok: true, athleteId: w.athlete_id };
  const { error } = await supabase.from("planned_workouts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  const removal = await removeFromDevice(supabase, w);
  await supabase.from("planned_workouts").update(removal).eq("id", id);
  return removal.removal_status === "failed"
    ? { ok: false, athleteId: w.athlete_id, error: removal.removal_error ?? "Device removal failed." }
    : { ok: true, athleteId: w.athlete_id };
}

/** When a draft that came from an AI suggestion's "Edit" is sent, retire the session that suggestion replaces. */
export async function retireReplacedBy(supabase: Supa, draftId: string): Promise<string | null> {
  const { data: s } = await supabase
    .from("ai_suggestions")
    .select("target_workout_id, action")
    .eq("result_workout_id", draftId)
    .eq("status", "edited")
    .maybeSingle();
  if (!s?.target_workout_id || s.action === "keep" || s.target_workout_id === draftId) return null;
  const r = await retireWorkout(supabase, s.target_workout_id);
  if (r.ok) return "The session it replaces was removed.";
  return r.athleteId
    ? `The session it replaces was removed here, but not from the watch yet: ${r.error} Retry from “Recently removed”.`
    : null;
}
