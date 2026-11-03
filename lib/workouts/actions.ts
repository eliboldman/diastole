"use server";

import { revalidatePath } from "next/cache";

import { removeWorkoutFromGarmin, resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createClient, requireCoach } from "@/lib/supabase/server";
import { adjustSteps, describeAdjustment, type Adjustment } from "@/lib/workouts/adjust";
import { validateSteps, type Step } from "@/lib/workouts/garmin-format";

export type Result = { ok: true; id?: string; ids?: string[]; message?: string } | { ok: false; error: string };

type Supa = Awaited<ReturnType<typeof createClient>>;
type WorkoutRow = {
  id: string;
  athlete_id: string;
  coach_id: string;
  title: string;
  sport: string;
  scheduled_date: string;
  description: string | null;
  steps: Step[];
  status: string;
  external_id: string | null;
  deleted_at: string | null;
  library_id: string | null;
};

const COLS = "id, athlete_id, coach_id, title, sport, scheduled_date, description, steps, status, external_id, deleted_at, library_id";

async function load(supabase: Supa, id: string): Promise<WorkoutRow | null> {
  // Row-level security limits this to the signed-in coach's own athletes.
  const { data } = await supabase.from("planned_workouts").select(COLS).eq("id", id).maybeSingle();
  return (data as WorkoutRow | null) ?? null;
}

async function deviceOf(supabase: Supa, athleteId: string) {
  const { data } = await supabase.from("device_connections").select("source").eq("athlete_id", athleteId).maybeSingle();
  return (data?.source ?? null) as "garmin" | "apple" | null;
}

function refresh(athleteId?: string, workoutId?: string) {
  if (athleteId) revalidatePath(`/athlete/${athleteId}`);
  if (athleteId && workoutId) revalidatePath(`/athlete/${athleteId}/workouts/${workoutId}`);
  revalidatePath("/workouts");
  revalidatePath("/dashboard");
}

/** Append a version snapshot of the workout as it is now. */
async function snapshot(supabase: Supa, w: WorkoutRow, change: string, by: string) {
  const { data: last } = await supabase
    .from("workout_versions")
    .select("version")
    .eq("workout_id", w.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("workout_versions").insert({
    workout_id: w.id,
    version: (last?.version ?? 0) + 1,
    change,
    title: w.title,
    sport: w.sport,
    scheduled_date: w.scheduled_date,
    description: w.description,
    steps: w.steps,
    created_by: by,
  });
}

// Exposed to the builder's save action (app/(coach)/athlete/[id]/workouts/actions.ts).
export async function recordVersion(workoutId: string, change: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const w = await load(supabase, workoutId);
  if (!w) return;
  if (change === "edited") {
    // Only record an edit when something actually changed since the last version.
    const { data: last } = await supabase
      .from("workout_versions")
      .select("title, sport, scheduled_date, description, steps")
      .eq("workout_id", w.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      last &&
      last.title === w.title &&
      last.sport === w.sport &&
      last.scheduled_date === w.scheduled_date &&
      (last.description ?? null) === (w.description ?? null) &&
      JSON.stringify(last.steps) === JSON.stringify(w.steps)
    )
      return;
  }
  await snapshot(supabase, w, change, coach.id);
}

/** Auto-save a builder workout into the coach's library (create once, then keep in sync while it's a draft). */
export async function syncToLibrary(workoutId: string): Promise<void> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const w = await load(supabase, workoutId);
  if (!w) return;
  const content = { title: w.title, sport: w.sport, description: w.description, steps: w.steps };

  const { data: existing } = await supabase
    .from("workout_library")
    .select("id")
    .eq("source_workout_id", w.id)
    .maybeSingle();
  if (existing) {
    await supabase.from("workout_library").update(content).eq("id", existing.id);
    return;
  }
  if (w.library_id) return; // Assigned from the library: the template stays as it was.
  const { data: created } = await supabase
    .from("workout_library")
    .insert({ ...content, coach_id: coach.id, source_workout_id: w.id, workout_type: guessType(w.title) })
    .select("id")
    .single();
  if (created) await supabase.from("planned_workouts").update({ library_id: created.id }).eq("id", w.id);
  revalidatePath("/library");
}

function guessType(title: string) {
  const t = title.toLowerCase();
  if (/recover/.test(t)) return "recovery";
  if (/tempo/.test(t)) return "tempo";
  if (/threshold|lt\b/.test(t)) return "threshold";
  if (/\d\s*[x×]\s*\d|interval|repeats?|vo2/.test(t)) return "intervals";
  if (/long/.test(t)) return "long";
  if (/easy|aerobic|base/.test(t)) return "easy";
  if (/race/.test(t)) return "race";
  return "other";
}

// ---------------------------------------------------------------- delete / undo

async function removeFromDevice(supabase: Supa, w: WorkoutRow) {
  const device = await deviceOf(supabase, w.athlete_id);
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

async function deleteOne(supabase: Supa, id: string): Promise<{ ok: boolean; athleteId?: string; error?: string }> {
  const w = await load(supabase, id);
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

export async function deleteWorkout(id: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const r = await deleteOne(supabase, id);
  refresh(r.athleteId, id);
  if (!r.ok && !r.athleteId) return { ok: false, error: r.error ?? "Couldn't delete." };
  return r.ok
    ? { ok: true, id, message: "Workout deleted." }
    : { ok: true, id, message: `Deleted here, but removing it from the watch failed: ${r.error} You can retry from “Recently removed”.` };
}

export async function deleteWorkouts(ids: string[]): Promise<Result> {
  await requireCoach();
  if (!ids.length) return { ok: false, error: "Nothing selected." };
  if (ids.length > 200) return { ok: false, error: "Delete at most 200 at a time." };
  const supabase = await createClient();
  let failed = 0;
  const athletes = new Set<string>();
  for (const id of ids) {
    const r = await deleteOne(supabase, id);
    if (r.athleteId) athletes.add(r.athleteId);
    if (!r.ok) failed += 1;
  }
  athletes.forEach((a) => refresh(a));
  refresh();
  return {
    ok: true,
    ids,
    message: failed
      ? `Deleted ${ids.length}. ${failed} couldn't be removed from the watch yet; retry them from “Recently removed”.`
      : `Deleted ${ids.length} workout${ids.length === 1 ? "" : "s"}.`,
  };
}

export async function undoDelete(id: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const w = await load(supabase, id);
  if (!w || !w.deleted_at) return { ok: false, error: "Nothing to undo." };
  await supabase
    .from("planned_workouts")
    .update({ deleted_at: null, removal_status: null, removal_error: null })
    .eq("id", id);

  let message = "Restored.";
  if (w.status === "sent" && !w.external_id && (await deviceOf(supabase, w.athlete_id)) === "garmin") {
    try {
      await resendWorkoutToGarmin(id);
      message = "Restored and sent back to Garmin.";
    } catch (e) {
      await supabase.from("planned_workouts").update({ status: "approved" }).eq("id", id);
      message = `Restored, but re-sending to Garmin failed: ${(e as Error).message}`;
    }
  }
  refresh(w.athlete_id, id);
  return { ok: true, id, message };
}

export async function undoDeletes(ids: string[]): Promise<Result> {
  const messages = [];
  for (const id of ids) messages.push(await undoDelete(id));
  const failed = messages.filter((m) => !m.ok || /failed/.test(m.message ?? "")).length;
  return { ok: true, ids, message: failed ? `Restored ${ids.length}; ${failed} need attention.` : `Restored ${ids.length}.` };
}

export async function retryRemoval(id: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const w = await load(supabase, id);
  if (!w?.deleted_at) return { ok: false, error: "Workout isn't deleted." };
  const removal = await removeFromDevice(supabase, w);
  await supabase.from("planned_workouts").update(removal).eq("id", id);
  refresh(w.athlete_id, id);
  return removal.removal_status === "failed"
    ? { ok: false, error: removal.removal_error ?? "Still failing." }
    : { ok: true, id, message: "Removed from the watch. It disappears at the next sync." };
}

// ---------------------------------------------------------------- adjust / duplicate / reschedule

async function afterChange(supabase: Supa, w: WorkoutRow): Promise<string> {
  if (w.status !== "sent") return "";
  const device = await deviceOf(supabase, w.athlete_id);
  if (device === "garmin") {
    await resendWorkoutToGarmin(w.id);
    return " Updated on Garmin; the watch gets it at the next sync.";
  }
  if (device === "apple") return " The athlete's iPhone app picks up the change at its next sync.";
  return "";
}

export async function adjustWorkout(id: string, a: Adjustment): Promise<Result> {
  const coach = await requireCoach();
  if (![5, 10].includes(a.percent) || !["harder", "easier"].includes(a.direction) || !["intensity", "duration", "both"].includes(a.scope))
    return { ok: false, error: "Invalid adjustment." };
  const supabase = await createClient();
  const w = await load(supabase, id);
  if (!w || w.deleted_at) return { ok: false, error: "Workout not found." };
  if (w.status === "completed" || w.status === "skipped") return { ok: false, error: `Can't adjust a ${w.status} workout.` };

  const steps = adjustSteps(w.steps, a);
  const errors = validateSteps(steps);
  if (errors.length) return { ok: false, error: errors.join(" ") };
  if (JSON.stringify(steps) === JSON.stringify(w.steps)) return { ok: false, error: "That adjustment wouldn't change anything in this workout." };

  const { error } = await supabase.from("planned_workouts").update({ steps }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  const updated = { ...w, steps };
  await snapshot(supabase, updated, describeAdjustment(a), coach.id);
  try {
    const extra = await afterChange(supabase, updated);
    refresh(w.athlete_id, id);
    return { ok: true, id, message: `Made ${describeAdjustment(a)}.${extra}` };
  } catch (e) {
    refresh(w.athlete_id, id);
    return { ok: false, error: `Saved, but updating Garmin failed: ${(e as Error).message}` };
  }
}

export async function rescheduleWorkout(id: string, date: string): Promise<Result> {
  const coach = await requireCoach();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  const supabase = await createClient();
  const w = await load(supabase, id);
  if (!w || w.deleted_at) return { ok: false, error: "Workout not found." };
  if (w.scheduled_date === date) return { ok: false, error: "It's already on that date." };

  const { error } = await supabase.from("planned_workouts").update({ scheduled_date: date }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  const updated = { ...w, scheduled_date: date };
  await snapshot(supabase, updated, `rescheduled from ${w.scheduled_date}`, coach.id);
  try {
    const extra = await afterChange(supabase, updated);
    refresh(w.athlete_id, id);
    return { ok: true, id, message: `Moved to ${date}.${extra}` };
  } catch (e) {
    refresh(w.athlete_id, id);
    return { ok: false, error: `Moved, but updating Garmin failed: ${(e as Error).message}` };
  }
}

export async function duplicateWorkout(id: string, date?: string): Promise<Result> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const w = await load(supabase, id);
  if (!w) return { ok: false, error: "Workout not found." };
  const { data, error } = await supabase
    .from("planned_workouts")
    .insert({
      athlete_id: w.athlete_id,
      coach_id: coach.id,
      title: w.title,
      sport: w.sport,
      scheduled_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : w.scheduled_date,
      description: w.description,
      steps: w.steps,
      status: "draft",
      library_id: w.library_id,
    })
    .select(COLS)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't duplicate." };
  await snapshot(supabase, data as WorkoutRow, "duplicated", coach.id);
  refresh(w.athlete_id);
  return { ok: true, id: data.id, message: "Duplicated as a new draft." };
}

// ---------------------------------------------------------------- library

export async function updateLibraryItem(
  id: string,
  patch: { title?: string; workout_type?: string; tags?: string[] },
): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const clean: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { ok: false, error: "Title can't be empty." };
    clean.title = patch.title.trim().slice(0, 100);
  }
  if (patch.workout_type !== undefined) clean.workout_type = patch.workout_type;
  if (patch.tags !== undefined)
    clean.tags = [...new Set(patch.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  // Once edited by hand, stop syncing from the original draft.
  clean.source_workout_id = null;
  const { error } = await supabase.from("workout_library").update(clean).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true, id };
}

export async function deleteLibraryItem(id: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("workout_library").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/library");
  return { ok: true, id };
}

/** One tap: copy a library workout to one or more athletes as drafts (still needs approve & send). */
export async function assignFromLibrary(libraryId: string, athleteIds: string[], date: string): Promise<Result> {
  const coach = await requireCoach();
  if (!athleteIds.length) return { ok: false, error: "Pick at least one athlete." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("workout_library")
    .select("id, title, sport, description, steps, use_count")
    .eq("id", libraryId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Library workout not found." };

  const ids: string[] = [];
  for (const athleteId of athleteIds) {
    const { data, error } = await supabase
      .from("planned_workouts")
      .insert({
        athlete_id: athleteId,
        coach_id: coach.id,
        title: item.title,
        sport: item.sport,
        scheduled_date: date,
        description: item.description,
        steps: item.steps,
        status: "draft",
        library_id: item.id,
      })
      .select(COLS)
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn't assign." };
    await snapshot(supabase, data as WorkoutRow, "assigned from library", coach.id);
    ids.push(data.id);
    refresh(athleteId);
  }
  await supabase
    .from("workout_library")
    .update({ use_count: (item.use_count ?? 0) + athleteIds.length, last_used_at: new Date().toISOString() })
    .eq("id", item.id);
  revalidatePath("/library");
  return {
    ok: true,
    ids,
    message: `Added as a draft for ${athleteIds.length} athlete${athleteIds.length === 1 ? "" : "s"}. Review and send from each athlete's page.`,
  };
}
