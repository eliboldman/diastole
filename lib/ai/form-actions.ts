"use server";

import { revalidatePath } from "next/cache";

import { runFormInsights } from "@/lib/ai/form-insights";
import { createClient, requireCoach } from "@/lib/supabase/server";
import { assignFromLibrary } from "@/lib/workouts/actions";

export type FormActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Look for running-form patterns for one athlete now (calls Claude only if there's something new). */
export async function checkFormNow(athleteId: string): Promise<FormActionResult> {
  const coach = await requireCoach();
  const supabase = await createClient();
  // Row-level security: the coach can only load their own athletes.
  const { data: athlete } = await supabase.from("profiles").select("id").eq("id", athleteId).eq("coach_id", coach.id).maybeSingle();
  if (!athlete) return { ok: false, error: "Athlete not found." };
  const r = await runFormInsights(coach.id, "manual", athleteId);
  revalidatePath(`/athlete/${athleteId}`);
  return r.status === "done"
    ? { ok: true, message: r.insights ? `${r.insights} new form insight${r.insights === 1 ? "" : "s"} ($${r.costUsd.toFixed(3)}).` : "Claude found nothing worth raising." }
    : { ok: true, message: r.reason };
}

/** One tap: add a suggested library workout as a draft. It still needs approve & send. */
export async function addFormPick(insightId: string, libraryId: string, date: string): Promise<FormActionResult> {
  await requireCoach();
  const supabase = await createClient();
  const { data: insight } = await supabase.from("form_insights").select("id, athlete_id, picks, added_ids").eq("id", insightId).maybeSingle();
  if (!insight) return { ok: false, error: "Insight not found." };
  if (!(insight.picks as { library_id: string }[]).some((p) => p.library_id === libraryId)) return { ok: false, error: "That workout isn't one of this insight's suggestions." };

  const r = await assignFromLibrary(libraryId, [insight.athlete_id], date);
  if (!r.ok) return { ok: false, error: r.error };
  await supabase
    .from("form_insights")
    .update({ status: "added", added_ids: [...(insight.added_ids ?? []), ...(r.ids ?? [])], decided_at: new Date().toISOString() })
    .eq("id", insightId);
  revalidatePath(`/athlete/${insight.athlete_id}`);
  return { ok: true, message: "Added as a draft. Open it from Planned workouts to approve and send." };
}

export async function dismissFormInsight(insightId: string): Promise<FormActionResult> {
  await requireCoach();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_insights")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .eq("id", insightId)
    .select("athlete_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't dismiss." };
  revalidatePath(`/athlete/${data.athlete_id}`);
  return { ok: true, message: "Dismissed." };
}
