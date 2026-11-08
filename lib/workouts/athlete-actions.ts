"use server";

import { revalidatePath } from "next/cache";

import { approveAndSend } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";
import { validateSteps, type Pool, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { parseWorkoutJson } from "@/lib/workouts/json-import";

// Athletes building their own workouts (no AI): a private library, JSON import, and "ask my coach
// to add this". Requests are drafts on the coach's side with requested_by set; the coach approves
// (sent like any workout) or declines. Request rows are written here with the service role after
// the checks below, because athletes can't write planned_workouts directly.

export type MyWorkout = { id?: string; title: string; sport: Sport; description: string; steps: Step[]; pool: Pool };
type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PENDING = 20;

function problem(w: MyWorkout): string | null {
  if (!w.title.trim()) return "Give the workout a title.";
  if (!["run", "bike", "swim"].includes(w.sport)) return "Pick a sport.";
  const pool = w.sport === "swim" ? w.pool : null;
  if (pool && (!(pool.length >= 10 && pool.length <= 100) || !["METER", "YARD"].includes(pool.unit))) return "Pick a pool length.";
  const errors = validateSteps(w.steps, 0, w.sport, pool);
  return errors.length ? [...new Set(errors)].join(" ") : null;
}
const row = (w: MyWorkout) => ({
  title: w.title.trim().slice(0, 100),
  sport: w.sport,
  description: w.description.trim().slice(0, 1024) || null,
  steps: w.steps,
  pool_length: w.sport === "swim" ? (w.pool?.length ?? null) : null,
  pool_unit: w.sport === "swim" ? (w.pool?.unit ?? null) : null,
});

// ---------------------------------------------------------------- library

/** Save to "My workouts" (new, or an edit of one of mine). */
export async function saveMyWorkout(w: MyWorkout): Promise<Result> {
  const me = await requireUser();
  const bad = problem(w);
  if (bad) return { ok: false, error: bad };
  const supabase = await createClient();
  if (w.id) {
    if (!UUID.test(w.id)) return { ok: false, error: "Workout not found." };
    const { error } = await supabase.from("athlete_library").update(row(w)).eq("id", w.id).eq("athlete_id", me.id);
    if (error) return { ok: false, error: "Couldn't save." };
    revalidatePath("/training/mine");
    return { ok: true, id: w.id, message: "Saved to My workouts." };
  }
  const { count } = await supabase.from("athlete_library").select("id", { count: "exact", head: true }).eq("athlete_id", me.id);
  if ((count ?? 0) >= 300) return { ok: false, error: "My workouts holds 300. Delete a few first." };
  const { data, error } = await supabase.from("athlete_library").insert({ ...row(w), athlete_id: me.id }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/training/mine");
  return { ok: true, id: data.id, message: "Saved to My workouts." };
}

export async function deleteMyWorkout(id: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Workout not found." };
  const supabase = await createClient();
  await supabase.from("athlete_library").delete().eq("id", id).eq("athlete_id", me.id);
  revalidatePath("/training/mine");
  return { ok: true };
}

/** Import JSON (pasted or from a file) into My workouts. With `ask`, dated ones also go to the coach as requests. */
export async function importMyWorkouts(text: string, ask: boolean): Promise<{ ok: true; saved: number; asked: number; errors: string[] } | { ok: false; error: string }> {
  const me = await requireUser();
  if (text.length > 400_000) return { ok: false, error: "That file is too big." };
  const supabase = await createClient();
  const { data: zones } = await supabase.from("athlete_zones").select("ftp_w").eq("athlete_id", me.id).maybeSingle();
  const parsed = parseWorkoutJson(text, { paceUnit: me.units === "km" ? "km" : "mi", ftp: zones?.ftp_w ?? null });
  let saved = 0;
  let asked = 0;
  const errors = [...parsed.errors];
  for (const w of parsed.workouts) {
    const mine: MyWorkout = { title: w.title, sport: w.sport, description: w.description ?? "", steps: w.steps, pool: w.pool };
    const r = await saveMyWorkout(mine);
    if (!r.ok) {
      errors.push(`${w.title}: ${r.error}`);
      continue;
    }
    saved++;
    if (ask && w.date) {
      const q = await requestWorkout({ ...mine, date: w.date });
      if (q.ok) asked++;
      else errors.push(`${w.title}: ${q.error}`);
    }
  }
  return { ok: true, saved, asked, errors };
}

// ---------------------------------------------------------------- requests

/** Ask my coach to add a workout on a date. It waits for their OK. */
export async function requestWorkout(w: MyWorkout & { date: string }): Promise<Result> {
  const me = await requireUser();
  if (!me.coach_id || me.coach_id === me.id) return { ok: false, error: "You need a coach on Diastole to add workouts to your calendar. You can still save them to My workouts." };
  if (!DATE.test(w.date)) return { ok: false, error: "Pick a date." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  if (w.date < today) return { ok: false, error: "Pick today or a later date." };
  const bad = problem(w);
  if (bad) return { ok: false, error: bad };
  const admin = createAdminClient();
  const { count } = await admin.from("planned_workouts").select("id", { count: "exact", head: true }).eq("requested_by", me.id).eq("status", "draft").is("declined_at", null).is("deleted_at", null);
  if ((count ?? 0) >= MAX_PENDING) return { ok: false, error: `You have ${MAX_PENDING} requests waiting. Give your coach a moment to catch up.` };

  const r = row(w);
  const { data, error } = await admin
    .from("planned_workouts")
    .insert({ athlete_id: me.id, coach_id: me.coach_id, requested_by: me.id, status: "draft", scheduled_date: w.date, title: r.title, sport: r.sport, description: r.description, steps: r.steps, pool_length: r.pool_length, pool_unit: r.pool_unit })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn't send the request." };
  const first = (me.full_name ?? "").trim().split(/\s+/)[0] || "An athlete";
  const when = new Date(`${w.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  await admin.rpc("server_notify", {
    p_user: me.coach_id,
    p_kind: "workout_request",
    p_title: `${first} wants to add a workout`,
    p_body: `${r.title} · ${when}. Approve it to send it to their watch.`,
    p_href: "/dashboard#requests",
    p_key: `request:${data.id}`,
  });
  revalidatePath("/training/mine");
  return { ok: true, id: data.id, message: "Sent to your coach. It goes on your calendar once they approve it." };
}

/** Take back a request that's still waiting (or clear a declined one). */
export async function cancelRequest(id: string): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const admin = createAdminClient();
  await admin.from("planned_workouts").delete().eq("id", id).eq("requested_by", me.id).eq("athlete_id", me.id).eq("status", "draft");
  revalidatePath("/training/mine");
  return { ok: true };
}

// ---------------------------------------------------------------- the coach's side

async function loadRequest(id: string) {
  const supabase = await createClient();
  // Row-level security: only the coach's own athletes' workouts.
  const { data } = await supabase
    .from("planned_workouts")
    .select("id, athlete_id, title, sport, scheduled_date, description, steps, pool_length, pool_unit, status, requested_by, declined_at, deleted_at")
    .eq("id", id)
    .maybeSingle();
  return data && data.requested_by && data.status === "draft" && !data.declined_at && !data.deleted_at ? data : null;
}

export async function approveRequest(id: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const w = await loadRequest(id);
  if (!w) return { ok: false, error: "That request is gone or already handled." };
  const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "METER" | "YARD" } : null;
  const r = await approveAndSend({ id: w.id, athleteId: w.athlete_id, title: w.title, sport: w.sport as Sport, scheduledDate: w.scheduled_date, description: w.description ?? "", steps: w.steps as Step[], pool });
  revalidatePath("/dashboard");
  return r.ok ? { ok: true, id: w.id, message: r.message } : { ok: false, error: r.error };
}

export async function declineRequest(id: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const w = await loadRequest(id);
  if (!w) return { ok: false, error: "That request is gone or already handled." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  // Never sent, so nothing to take off a watch: mark it removed so it leaves the coach's lists.
  const { error } = await supabase.from("planned_workouts").update({ declined_at: now, deleted_at: now, removal_status: "removed" }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't decline." };
  await createAdminClient().rpc("server_notify", {
    p_user: w.athlete_id,
    p_kind: "workout_declined",
    p_title: `Not this time: ${w.title}`,
    p_body: "Your coach passed on this one. Message them if you'd like to talk it through.",
    p_href: "/training/mine",
    p_key: `declined:${w.id}`,
  });
  revalidatePath("/dashboard");
  return { ok: true, message: "Declined." };
}
