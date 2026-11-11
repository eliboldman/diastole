"use server";

import { revalidatePath } from "next/cache";

import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { removeFromDevice, retireWorkout } from "@/lib/workouts/retire";
import { createClient, requireCoach } from "@/lib/supabase/server";
import { adjustSteps, describeAdjustment, type Adjustment } from "@/lib/workouts/adjust";
import { fromConnectWorkout } from "@/lib/workouts/connect-import";
import { validateSteps, type Brick, type Pool, type PoolUnit, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { annotate, hasRelative, resolve, ZONE_COLUMNS, type RelZones } from "@/lib/workouts/relative";
import { cleanWeek, windowFor } from "@/lib/week-prefs";
import type { StrengthItem } from "@/lib/strength/workout";
import { planSchedule, type ImportedRef, type ScheduleRow, type ScheduleSkip } from "@/lib/workouts/schedule-import";

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
  pool_length: number | null;
  pool_unit: PoolUnit | null;
  brick: Brick;
  strength?: StrengthItem[] | null;
};

const COLS = "id, athlete_id, coach_id, title, sport, scheduled_date, description, steps, status, external_id, deleted_at, library_id, pool_length, pool_unit, brick, strength";
const poolOf = (w: { pool_length: number | null; pool_unit: PoolUnit | null }): Pool =>
  w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit } : null;

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
    brick: w.brick ?? null,
    pool_length: w.pool_length,
    pool_unit: w.pool_unit,
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
      .select("title, sport, scheduled_date, description, steps, pool_length, pool_unit, brick")
      .eq("workout_id", w.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (
      last &&
      last.title === w.title &&
      last.sport === w.sport &&
      last.scheduled_date === w.scheduled_date &&
      Number(last.pool_length ?? 0) === Number(w.pool_length ?? 0) &&
      (last.pool_unit ?? null) === (w.pool_unit ?? null) &&
      (last.description ?? null) === (w.description ?? null) &&
      JSON.stringify(last.steps) === JSON.stringify(w.steps) &&
      JSON.stringify(last.brick ?? null) === JSON.stringify(w.brick ?? null)
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
  const content = { title: w.title, sport: w.sport, description: w.description, steps: w.steps, brick: w.brick ?? null, strength: w.strength ?? null, pool_length: w.pool_length, pool_unit: w.pool_unit };

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

export async function deleteWorkout(id: string): Promise<Result> {
  await requireCoach();
  const supabase = await createClient();
  const r = await retireWorkout(supabase, id);
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
    const r = await retireWorkout(supabase, id);
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

  const steps = adjustSteps(w.steps, a, { swim: w.sport === "swim", pool: poolOf(w) });
  const errors = validateSteps(steps, 0, w.sport as Sport, poolOf(w));
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
      brick: w.brick,
      strength: w.strength ?? null,
      pool_length: w.pool_length,
      pool_unit: w.pool_unit,
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
    .select("id, title, sport, description, steps, use_count, pool_length, pool_unit, source_workout_id, brick, strength")
    .eq("id", libraryId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Library workout not found." };
  // Templates saved before targets scaled: work the percentages out from the athlete it was built for.
  if (!hasRelative((item.steps ?? []) as Step[]) && item.source_workout_id) {
    const { data: src } = await supabase.from("planned_workouts").select("athlete_id").eq("id", item.source_workout_id).maybeSingle();
    if (src) {
      const { data: z } = await supabase.from("athlete_zones").select(ZONE_COLUMNS).eq("athlete_id", src.athlete_id).maybeSingle();
      const steps = annotate((item.steps ?? []) as Step[], z as RelZones);
      if (hasRelative(steps)) {
        item.steps = steps;
        await supabase.from("workout_library").update({ steps }).eq("id", item.id);
      }
    }
  }

  // Each athlete gets targets worked out from their own zones (when the template has percentages).
  const [{ data: zoneRows }, { data: people }, { data: weeks }] = await Promise.all([
    supabase.from("athlete_zones").select(`athlete_id, ${ZONE_COLUMNS}`).in("athlete_id", athleteIds),
    supabase.from("profiles").select("id, full_name").in("id", athleteIds),
    supabase.from("athlete_week").select("athlete_id, days").in("athlete_id", athleteIds),
  ]);
  const zonesOf = new Map((zoneRows ?? []).map((z) => [z.athlete_id as string, z as RelZones]));
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, ((p.full_name as string | null) ?? "").split(" ")[0] || "an athlete"]));
  const kept: string[] = [];

  const ids: string[] = [];
  for (const athleteId of athleteIds) {
    const itemPool: Pool = item.pool_length && item.pool_unit ? { length: Number(item.pool_length), unit: item.pool_unit as PoolUnit } : null;
    const scaled = resolve((item.steps ?? []) as Step[], zonesOf.get(athleteId) ?? null, itemPool);
    const run = (item.brick as Brick)?.steps?.length ? resolve((item.brick as NonNullable<Brick>).steps, zonesOf.get(athleteId) ?? null) : null;
    if (run) scaled.missing = [...new Set([...scaled.missing, ...run.missing])];
    if (scaled.missing.length) kept.push(`${nameOf.get(athleteId)} (no ${scaled.missing.join(" or ")})`);
    const { data, error } = await supabase
      .from("planned_workouts")
      .insert({
        athlete_id: athleteId,
        coach_id: coach.id,
        title: item.title,
        sport: item.sport,
        scheduled_date: date,
        description: item.description,
        steps: scaled.steps,
        brick: run ? { sport: "run", steps: run.steps } : null,
        strength: item.sport === "strength" ? (item.strength ?? []) : null,
        start_time: windowFor(cleanWeek(weeks?.find((x) => x.athlete_id === athleteId)?.days), date)?.start ?? null,
        pool_length: item.pool_length,
        pool_unit: item.pool_unit,
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
    message: `Added as a draft for ${athleteIds.length} athlete${athleteIds.length === 1 ? "" : "s"}${hasRelative((item.steps ?? []) as Step[]) ? ", with targets from each athlete's zones" : ""}. Review and send from each athlete's page.${kept.length ? ` Kept the written targets for ${kept.join(", ")}.` : ""}`,
  };
}

// ---------------------------------------------------------------- import from Garmin Connect

export type ImportedItem = {
  file: string;
  ok: boolean;
  title?: string;
  notes?: string[];
  error?: string;
  /** Library row it landed in (new, or an identical earlier import). */
  id?: string;
  /** Garmin Connect workoutId from the file, used to match a schedule.csv. */
  garminId?: string | null;
  reused?: boolean;
};

/** JSON with object keys sorted, so jsonb read back from Postgres compares equal to what was written. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Adds workouts exported from Garmin Connect (.json) to the coach's library. */
export async function importConnectWorkouts(files: { name: string; text: string }[]): Promise<{ results: ImportedItem[] }> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const results: ImportedItem[] = [];
  for (const f of files.slice(0, 20)) {
    const name = String(f.name).slice(0, 120);
    if (typeof f.text !== "string" || f.text.length > 300_000) {
      results.push({ file: name, ok: false, error: "File is too large to be a workout." });
      continue;
    }
    try {
      const raw = JSON.parse(f.text);
      const garminId = raw && (typeof raw.workoutId === "number" || typeof raw.workoutId === "string") ? String(raw.workoutId) : null;
      const w = fromConnectWorkout(raw);
      // Uploading the same export twice reuses the earlier import instead of doubling the library.
      const { data: same } = await supabase
        .from("workout_library")
        .select("id, steps, pool_length, pool_unit")
        .eq("coach_id", coach.id)
        .eq("title", w.title)
        .eq("sport", w.sport)
        .contains("tags", ["imported"])
        .limit(10);
      const twin = (same ?? []).find(
        (s) => canon(s.steps) === canon(w.steps) && (s.pool_length ?? null) === (w.pool?.length ?? null) && (s.pool_unit ?? null) === (w.pool?.unit ?? null),
      );
      if (twin) {
        results.push({ file: name, ok: true, title: w.title, notes: w.skipped, id: twin.id, garminId, reused: true });
        continue;
      }
      const { data: row, error } = await supabase.from("workout_library").insert({
        coach_id: coach.id,
        title: w.title,
        sport: w.sport,
        description: w.description,
        steps: w.steps,
        pool_length: w.pool?.length ?? null,
        pool_unit: w.pool?.unit ?? null,
        workout_type: guessType(w.title),
        tags: ["imported"],
      }).select("id").single();
      if (error || !row) throw new Error(error?.message ?? "Couldn't save the workout.");
      results.push({ file: name, ok: true, title: w.title, notes: w.skipped, id: row.id, garminId });
    } catch (e) {
      results.push({ file: name, ok: false, error: e instanceof SyntaxError ? "Not a valid JSON file." : (e as Error).message });
    }
  }
  revalidatePath("/library");
  return { results };
}

/**
 * One time only: puts a Connect export's schedule.csv on one athlete's calendar as drafts.
 * Nothing repeats and nothing is sent; past dates and workouts already on those days are skipped.
 */
export async function scheduleImportedWorkouts(
  athleteId: string,
  rows: ScheduleRow[],
  imported: ImportedRef[],
): Promise<Result & { added?: number; skipped?: ScheduleSkip[] }> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("profiles").select("id, timezone").eq("id", athleteId).eq("coach_id", coach.id).maybeSingle();
  if (!athlete) return { ok: false, error: "Pick one of your athletes." };
  const clean = (Array.isArray(rows) ? rows : [])
    .slice(0, 200)
    .filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && typeof r.title === "string")
    .map((r) => ({ date: String(r.date), title: r.title.slice(0, 200), workoutId: r.workoutId ? String(r.workoutId) : null }));
  if (!clean.length) return { ok: false, error: "The schedule had no dated workouts." };

  // Only library rows this coach owns can be scheduled.
  const ids = [...new Set((Array.isArray(imported) ? imported : []).map((i) => String(i?.libraryId)))].slice(0, 200);
  const { data: owned } = await supabase.from("workout_library").select("id").eq("coach_id", coach.id).in("id", ids);
  const ok = new Set((owned ?? []).map((o) => o.id as string));
  const refs = imported.filter((i) => ok.has(String(i.libraryId))).map((i) => ({ libraryId: String(i.libraryId), title: String(i.title), garminId: i.garminId ? String(i.garminId) : null }));

  const dates = clean.map((r) => r.date).sort();
  const { data: existing } = await supabase
    .from("planned_workouts")
    .select("scheduled_date, title")
    .eq("athlete_id", athleteId)
    .is("deleted_at", null)
    .gte("scheduled_date", dates[0])
    .lte("scheduled_date", dates[dates.length - 1]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: athlete.timezone || coach.timezone || "UTC" });
  const { add, skipped } = planSchedule(
    clean,
    refs,
    (existing ?? []).map((e) => ({ date: e.scheduled_date as string, title: e.title as string })),
    today,
  );

  let added = 0;
  for (const a of add) {
    const r = await assignFromLibrary(a.libraryId, [athleteId], a.date);
    if (r.ok) added++;
    else skipped.push({ date: a.date, title: a.title, reason: r.error });
  }
  return {
    ok: true,
    added,
    skipped,
    message: added ? `Added ${added} draft${added === 1 ? "" : "s"}. Review and send from the athlete's page.` : "Nothing new to add.",
  };
}
