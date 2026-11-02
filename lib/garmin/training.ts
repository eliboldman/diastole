import "server-only";

import { garminFetch } from "@/lib/garmin/client";
import { createAdminClient } from "@/lib/supabase/server";
import { toGarminWorkout, type Sport, type Step } from "@/lib/workouts/garmin-format";

/**
 * Sends one planned workout to the athlete's Garmin calendar (Training API V2).
 * Refuses unless the coach has approved it (approved_at set). The database also enforces this.
 */
export async function sendWorkoutToGarmin(workoutId: string) {
  const admin = createAdminClient();
  const { data: w, error } = await admin
    .from("planned_workouts")
    .select("id, athlete_id, scheduled_date, sport, title, description, steps, status, approved_at, external_id")
    .eq("id", workoutId)
    .single();
  if (error || !w) throw new Error("Workout not found.");
  if (!w.approved_at || w.status !== "approved") throw new Error("Workout must be approved by the coach before sending.");
  if (w.external_id) throw new Error("Workout was already sent to Garmin.");

  const body = toGarminWorkout({
    title: w.title,
    description: w.description,
    sport: w.sport as Sport,
    steps: w.steps as Step[],
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

  await admin
    .from("planned_workouts")
    .update({ status: "sent", sent_at: new Date().toISOString(), external_id: String(garminWorkoutId) })
    .eq("id", w.id);

  return { garminWorkoutId };
}
