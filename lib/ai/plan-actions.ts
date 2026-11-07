"use server";

import { revalidatePath } from "next/cache";

import { deliver } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { splitCoachingDoc, type SplitDoc } from "@/lib/ai/coaching-doc";
import { createClient, requireCoach, requireUser } from "@/lib/supabase/server";
import { cleanWeek } from "@/lib/week-prefs";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** The coach's coaching guide, used by every suggested workout. */
export async function savePhilosophy(text: string): Promise<Result> {
  const me = await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("coach_settings").upsert({ coach_id: me.id, philosophy: text.trim().slice(0, 20000) || null }, { onConflict: "coach_id" });
  if (error) return { ok: false, error: "Couldn't save the guide." };
  revalidatePath("/account/settings");
  return { ok: true };
}

/** Private notes about one athlete (goal, period, constraints). The athlete never sees them. */
export async function saveAthleteNotes(athleteId: string, notes: string): Promise<Result> {
  const me = await requireCoach();
  if (!UUID.test(athleteId)) return { ok: false, error: "Unknown athlete." };
  const supabase = await createClient();
  const { error } = await supabase.from("athlete_coaching").upsert({ athlete_id: athleteId, coach_id: me.id, notes: notes.trim().slice(0, 8000), updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { ok: false, error: "Couldn't save the notes." };
  revalidatePath(`/athlete/${athleteId}`);
  return { ok: true };
}

/** Splits an uploaded coaching document against this coach's roster, for review before saving. */
export async function previewCoachingDoc(text: string): Promise<{ ok: true; split: SplitDoc } | { ok: false; error: string }> {
  const me = await requireCoach();
  if (!text.trim()) return { ok: false, error: "That file is empty." };
  if (text.length > 200_000) return { ok: false, error: "That file is too big. Paste the important parts instead." };
  const supabase = await createClient();
  const { data: roster } = await supabase.from("profiles").select("id, full_name").or(`coach_id.eq.${me.id},id.eq.${me.id}`);
  return { ok: true, split: splitCoachingDoc(text, roster ?? []) };
}

/** Saves a reviewed import: the guide plus each matched athlete's notes. */
export async function saveCoachingImport(guide: string, athletes: { id: string; notes: string }[]): Promise<Result> {
  const saved = await savePhilosophy(guide);
  if (!saved.ok) return saved;
  for (const a of athletes.slice(0, 100)) {
    const r = await saveAthleteNotes(a.id, a.notes);
    if (!r.ok) return r;
  }
  return { ok: true, message: `Saved the guide and notes for ${athletes.length} athlete${athletes.length === 1 ? "" : "s"}.` };
}

/** The athlete's preferred week. The athlete, or their coach (row-level security). */
export async function saveWeekPrefs(athleteId: string | null, days: unknown): Promise<Result> {
  const me = await requireUser();
  const id = athleteId && UUID.test(athleteId) ? athleteId : me.id;
  const supabase = await createClient();
  const { error } = await supabase.from("athlete_week").upsert({ athlete_id: id, days: cleanWeek(days), updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  if (error) return { ok: false, error: "Couldn't save your week." };
  revalidatePath("/account/settings");
  revalidatePath(`/athlete/${id}`);
  return { ok: true };
}

/** Approve every remaining draft in a suggested block and send them (to Garmin, or marked for the iPhone app). */
export async function approvePlanBatch(batchId: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(batchId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data: drafts } = await supabase.from("planned_workouts").select("id, athlete_id").eq("plan_batch", batchId).eq("status", "draft").is("deleted_at", null).order("scheduled_date");
  if (!drafts?.length) return { ok: false, error: "No drafts left in this block." };
  const { error } = await supabase.from("planned_workouts").update({ status: "approved", approved_at: new Date().toISOString() }).in("id", drafts.map((d) => d.id)).eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  let failed = 0;
  for (const d of drafts) if (!(await deliver(d.id, d.athlete_id)).ok) failed += 1;
  revalidatePath(`/athlete/${drafts[0].athlete_id}`);
  return failed ? { ok: false, error: `Approved ${drafts.length}; ${failed} didn't send. Retry them from the athlete page.` } : { ok: true, message: `Approved and sent ${drafts.length} workout${drafts.length === 1 ? "" : "s"}.` };
}

/** Throw away the drafts left in a suggested block. */
export async function discardPlanBatch(batchId: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(batchId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data } = await supabase.from("planned_workouts").delete().eq("plan_batch", batchId).eq("status", "draft").select("athlete_id");
  if (data?.[0]) revalidatePath(`/athlete/${data[0].athlete_id}`);
  return { ok: true, message: `Discarded ${data?.length ?? 0} draft${data?.length === 1 ? "" : "s"}.` };
}
