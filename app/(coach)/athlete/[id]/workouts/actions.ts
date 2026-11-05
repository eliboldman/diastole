"use server";

import { revalidatePath } from "next/cache";

import { sendWorkoutToGarmin } from "@/lib/garmin/training";
import { recordVersion, syncToLibrary } from "@/lib/workouts/actions";
import { createClient, requireCoach } from "@/lib/supabase/server";
import { validateSteps, type Pool, type Sport, type Step } from "@/lib/workouts/garmin-format";

export type WorkoutInput = {
  id?: string;
  athleteId: string;
  title: string;
  sport: Sport;
  scheduledDate: string;
  description: string;
  steps: Step[];
  pool?: Pool; // swims only; null = any pool
  why?: string; // what the athlete sees about the session's purpose (the coach wrote or approved it)
};

export type ActionResult = { ok: true; id: string; message?: string } | { ok: false; error: string };

function check(input: WorkoutInput): string | null {
  if (!input.title.trim()) return "Give the workout a title.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) return "Pick a date.";
  if (!["run", "bike", "swim"].includes(input.sport)) return "Pick a sport.";
  const pool = input.sport === "swim" ? (input.pool ?? null) : null;
  if (pool && (!(pool.length >= 10 && pool.length <= 100) || !["METER", "YARD"].includes(pool.unit))) return "Pick a pool length.";
  const errors = validateSteps(input.steps, 0, input.sport, pool);
  return errors.length ? [...new Set(errors)].join(" ") : null;
}

/** Create or update a draft. Row-level security limits this to the coach's own athletes. */
export async function saveDraft(input: WorkoutInput): Promise<ActionResult> {
  const coach = await requireCoach();
  const problem = check(input);
  if (problem) return { ok: false, error: problem };

  const supabase = await createClient();
  const row = {
    athlete_id: input.athleteId,
    coach_id: coach.id,
    title: input.title.trim(),
    sport: input.sport,
    scheduled_date: input.scheduledDate,
    description: input.description.trim() || null,
    steps: input.steps,
    pool_length: input.sport === "swim" ? (input.pool?.length ?? null) : null,
    pool_unit: input.sport === "swim" ? (input.pool?.unit ?? null) : null,
    ...(input.why !== undefined
      ? { why: input.why.replace(/\s+/g, " ").trim().slice(0, 400) || null, why_updated_at: input.why.trim() ? new Date().toISOString() : null }
      : {}),
  };

  if (input.id) {
    const { error } = await supabase.from("planned_workouts").update(row).eq("id", input.id).eq("status", "draft");
    if (error) return { ok: false, error: error.message };
    await recordVersion(input.id, "edited");
    await syncToLibrary(input.id);
    revalidatePath(`/athlete/${input.athleteId}`);
    return { ok: true, id: input.id, message: "Draft saved." };
  }

  const { data, error } = await supabase.from("planned_workouts").insert({ ...row, status: "draft" }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await recordVersion(data.id, "created");
  await syncToLibrary(data.id); // every builder workout is kept in the coach's library
  revalidatePath(`/athlete/${input.athleteId}`);
  return { ok: true, id: data.id, message: "Draft saved." };
}

/** The coach's explicit confirmation: approve, then deliver to the athlete's device. */
export async function approveAndSend(input: WorkoutInput): Promise<ActionResult> {
  const saved = await saveDraft(input);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const { error } = await supabase
    .from("planned_workouts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", saved.id)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };

  return deliver(saved.id, input.athleteId);
}

/** Send (or retry sending) an already-approved workout. */
export async function deliver(workoutId: string, athleteId: string): Promise<ActionResult> {
  await requireCoach();
  const supabase = await createClient();
  // Confirms, via row-level security, that this workout belongs to one of the coach's athletes.
  const { data: w } = await supabase.from("planned_workouts").select("id, status, deleted_at").eq("id", workoutId).maybeSingle();
  if (!w || w.deleted_at) return { ok: false, error: "Workout not found." };

  const { data: device } = await supabase.from("device_connections").select("source").eq("athlete_id", athleteId).maybeSingle();
  revalidatePath(`/athlete/${athleteId}`);

  if (device?.source === "garmin") {
    try {
      await sendWorkoutToGarmin(workoutId);
      return { ok: true, id: workoutId, message: "Sent to Garmin. It appears on the watch after the next sync." };
    } catch (e) {
      return { ok: false, error: `Approved, but sending failed: ${(e as Error).message}` };
    }
  }
  if (device?.source === "apple") {
    return { ok: true, id: workoutId, message: "Approved. The athlete's iPhone app will pick it up." };
  }
  return { ok: true, id: workoutId, message: "Approved. The athlete has no device connected yet." };
}

export async function deleteDraft(workoutId: string, athleteId: string): Promise<ActionResult> {
  await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("planned_workouts").delete().eq("id", workoutId).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/athlete/${athleteId}`);
  return { ok: true, id: workoutId };
}
