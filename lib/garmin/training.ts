import "server-only";

import { sealed, sealedTitle } from "@/lib/workouts/mystery";
import { garminFetch } from "@/lib/garmin/client";
import { createAdminClient } from "@/lib/supabase/server";
import { toGarminWorkout, type Brick, type PoolUnit, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { toGarminStrength, type StrengthItem } from "@/lib/strength/workout";

/** The athlete's weight unit for the watch (pounds for mile users). */
async function weightUnit(admin: ReturnType<typeof createAdminClient>, athleteId: string): Promise<"kg" | "lb"> {
  const { data } = await admin.from("profiles").select("units").eq("id", athleteId).maybeSingle();
  return data?.units === "km" ? "kg" : "lb";
}

/**
 * Sends one planned workout to the athlete's Garmin calendar (Training API V2).
 * Refuses unless the coach has approved it (approved_at set). The database also enforces this.
 */
export async function sendWorkoutToGarmin(workoutId: string) {
  const admin = createAdminClient();
  const { data: w, error } = await admin
    .from("planned_workouts")
    .select("id, athlete_id, scheduled_date, sport, title, description, steps, status, approved_at, external_id, pool_length, pool_unit, brick, strength, mystery, revealed_at")
    .eq("id", workoutId)
    .single();
  if (error || !w) throw new Error("Workout not found.");
  // Hard guard: AI test-mode athletes are fake, so nothing for them ever goes to Garmin.
  const { data: athlete } = await admin.from("profiles").select("is_test").eq("id", w.athlete_id).single();
  if (athlete?.is_test) throw new Error("Test athletes never receive workouts on a watch.");
  // "sent" is allowed for re-sends after an adjust or reschedule (the old copy is removed first).
  if (!w.approved_at || (w.status !== "approved" && w.status !== "sent"))
    throw new Error("Workout must be approved by the coach before sending.");
  if (w.external_id) throw new Error("Workout was already sent to Garmin.");

  // Mystery: the watch calendar shows it sealed; each step still shows as it starts.
  if (sealed(w)) {
    w.title = sealedTitle(w);
    w.description = "Sealed by your coach. Each step shows as it starts.";
  }
  const body = w.sport === "strength" ? toGarminStrength(w.title, (w.strength ?? []) as StrengthItem[], await weightUnit(admin, w.athlete_id), w.description) : toGarminWorkout({
    title: w.title,
    description: w.description,
    sport: w.sport as Sport,
    steps: w.steps as Step[],
    pool: w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null,
    brick: (w.brick ?? null) as Brick,
  });

  const created = await garminFetch(w.athlete_id, "/workoutportal/workout/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!created.ok) throw new Error(`Garmin rejected the workout (${created.status}): ${(await created.text()).slice(0, 300)}`);
  const { workoutId: garminWorkoutId } = (await created.json()) as { workoutId: number };

  const scheduled = await garminFetch(w.athlete_id, "/training-api/schedule/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workoutId: garminWorkoutId, date: w.scheduled_date }),
  });
  if (!scheduled.ok) {
    // Don't leave an unscheduled orphan in the athlete's Garmin library.
    await garminFetch(w.athlete_id, `/training-api/workout/v2/${garminWorkoutId}`, { method: "DELETE" }).catch(() => {});
    throw new Error(`Garmin couldn't schedule the workout (${scheduled.status}): ${(await scheduled.text()).slice(0, 300)}`);
  }

  // The schedule id lets a later delete remove the calendar entry explicitly, not just the workout.
  const scheduleText = await scheduled.text();
  let scheduleId: string | null = null;
  try {
    const parsed = JSON.parse(scheduleText);
    scheduleId = String(typeof parsed === "object" && parsed ? (parsed.scheduleId ?? parsed.id ?? "") : parsed) || null;
  } catch {
    scheduleId = scheduleText.trim() || null;
  }

  await admin
    .from("planned_workouts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      external_id: String(garminWorkoutId),
      garmin_schedule_id: scheduleId,
    })
    .eq("id", w.id);

  return { garminWorkoutId };
}

/**
 * Removes a previously sent workout from the athlete's Garmin account: the calendar entry first,
 * then the workout itself. Clears the Garmin ids so the workout can be sent again later.
 */
export async function removeWorkoutFromGarmin(workoutId: string) {
  const admin = createAdminClient();
  const { data: w } = await admin
    .from("planned_workouts")
    .select("athlete_id, external_id, garmin_schedule_id")
    .eq("id", workoutId)
    .single();
  if (!w?.external_id) return;

  if (w.garmin_schedule_id) {
    const res = await garminFetch(w.athlete_id, `/training-api/schedule/${w.garmin_schedule_id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`Garmin couldn't remove the calendar entry (${res.status}).`);
  }
  // Deleting the workout also drops any schedule Garmin still has for it (older sends stored no schedule id).
  const res = await garminFetch(w.athlete_id, `/training-api/workout/v2/${w.external_id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Garmin couldn't remove the workout (${res.status}).`);

  await admin.from("planned_workouts").update({ external_id: null, garmin_schedule_id: null }).eq("id", workoutId);
}

/** Replace what's on Garmin with the current version (after an adjust or reschedule of a sent workout). */
export async function resendWorkoutToGarmin(workoutId: string) {
  await removeWorkoutFromGarmin(workoutId);
  return sendWorkoutToGarmin(workoutId);
}
