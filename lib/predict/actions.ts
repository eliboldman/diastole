"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** The athlete hides or shows their own race estimates (their coach still sees them). */
export async function setPredictionsHidden(hidden: boolean): Promise<{ ok: boolean }> {
  const me = await requireUser();
  const { error } = await createAdminClient().from("profiles").update({ hide_predictions: Boolean(hidden) }).eq("id", me.id);
  revalidatePath("/races");
  return { ok: !error };
}

/** The coach's note shown with an athlete's estimates. Empty clears it. */
export async function savePredictionNote(athleteId: string, note: string): Promise<{ ok: boolean; error?: string }> {
  await requireCoach();
  if (!UUID.test(athleteId)) return { ok: false, error: "Unknown athlete." };
  const text = note.trim().slice(0, 600);
  const supabase = await createClient();
  const { error } = text
    ? await supabase.from("race_prediction_notes").upsert({ athlete_id: athleteId, note: text, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" })
    : await supabase.from("race_prediction_notes").delete().eq("athlete_id", athleteId);
  revalidatePath(`/athlete/${athleteId}`);
  return error ? { ok: false, error: "Couldn't save." } : { ok: true };
}
