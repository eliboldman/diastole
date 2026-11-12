"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Coach: seal (or unseal) a workout, with a note the athlete reads when it's revealed. */
export async function setMystery(workoutId: string, on: boolean, note: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(workoutId)) return { ok: false, error: "Workout not found." };
  const clean = note.replace(/\s+/g, " ").trim().slice(0, 300) || null;
  const supabase = await createClient(); // RLS: only the coach's own athletes' workouts
  const { data, error } = await supabase.from("planned_workouts").update({ mystery: on, mystery_note: clean, ...(on ? { revealed_at: null } : {}) }).eq("id", workoutId).select("athlete_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save that." };
  revalidatePath(`/athlete/${data.athlete_id}/workouts/${workoutId}`);
  return { ok: true };
}

/** Athlete: open it all now. Always allowed: knowing the session matters more than the surprise. */
export async function revealMystery(workoutId: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(workoutId)) return { ok: false, error: "Workout not found." };
  const admin = createAdminClient();
  const { error } = await admin.from("planned_workouts").update({ revealed_at: new Date().toISOString() }).eq("id", workoutId).eq("athlete_id", me.id).eq("mystery", true);
  if (error) return { ok: false, error: "Couldn't reveal it. Try again." };
  revalidatePath(`/training/workouts/${workoutId}`);
  revalidatePath("/me");
  return { ok: true };
}
