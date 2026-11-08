"use server";

import { revalidatePath } from "next/cache";

import { cleanItems, STARTERS } from "@/lib/recovery/catalog";
import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

type Result = { ok: true; id?: string; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Create or update one of the coach's routines. */
export async function saveRoutine(input: { id?: string; title: string; description: string; items: unknown }): Promise<Result> {
  const me = await requireCoach();
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
  const items = cleanItems(input.items);
  if (!title) return { ok: false, error: "Give the routine a name." };
  if (!items.length) return { ok: false, error: "Add at least one move." };
  const row = { title, description: input.description.trim().slice(0, 300) || null, items };
  const supabase = await createClient();
  if (input.id) {
    if (!UUID.test(input.id)) return { ok: false, error: "Routine not found." };
    const { error } = await supabase.from("recovery_routines").update(row).eq("id", input.id).eq("coach_id", me.id);
    if (error) return { ok: false, error: "Couldn't save." };
    revalidatePath("/lab/recovery");
    return { ok: true, id: input.id, message: "Saved." };
  }
  const { data, error } = await supabase.from("recovery_routines").insert({ ...row, coach_id: me.id }).select("id").single();
  if (error) return { ok: false, error: "Couldn't save." };
  revalidatePath("/lab/recovery");
  return { ok: true, id: data.id, message: "Saved to your recovery library." };
}

export async function deleteRoutine(id: string): Promise<Result> {
  const me = await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Routine not found." };
  const supabase = await createClient();
  await supabase.from("recovery_routines").delete().eq("id", id).eq("coach_id", me.id);
  revalidatePath("/lab/recovery");
  return { ok: true };
}

/** Put a routine (one of the coach's, or a starter) on athletes' day, like a workout. */
export async function assignRoutine(key: string, athleteIds: string[], date: string): Promise<Result> {
  const me = await requireCoach();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick a date." };
  const ids = [...new Set(athleteIds)].filter((x) => UUID.test(x)).slice(0, 100);
  if (!ids.length) return { ok: false, error: "Pick at least one athlete." };
  const supabase = await createClient();
  const starter = STARTERS.find((s) => s.id === key);
  const routine = starter
    ? { id: null, title: starter.title, items: starter.items }
    : UUID.test(key)
      ? await supabase.from("recovery_routines").select("id, title, items").eq("id", key).eq("coach_id", me.id).maybeSingle().then(({ data }) => (data ? { id: data.id, title: data.title, items: cleanItems(data.items) } : null))
      : null;
  if (!routine) return { ok: false, error: "Routine not found." };
  const rows = ids.map((athlete_id) => ({ athlete_id, coach_id: me.id, routine_id: routine.id, title: routine.title, items: routine.items, scheduled_date: date }));
  // Row-level security only allows the coach's own athletes (or themself).
  const { data, error } = await supabase.from("recovery_assignments").insert(rows).select("id, athlete_id");
  if (error) return { ok: false, error: "Couldn't assign. Check the athletes are yours." };
  const admin = createAdminClient();
  const when = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  for (const a of data ?? []) {
    if (a.athlete_id === me.id) continue;
    await admin.rpc("server_notify", { p_user: a.athlete_id, p_kind: "workout_recovery", p_title: `Recovery: ${routine.title}`, p_body: `From your coach for ${when}. Tap to follow along.`, p_href: `/recovery/a-${a.id}`, p_key: `recovery:${a.id}` });
  }
  return { ok: true, message: `Assigned to ${data?.length ?? 0} athlete${data?.length === 1 ? "" : "s"} for ${when}.` };
}

/** The athlete finished a routine (it counts toward their week; an assigned one is marked done). */
export async function finishSession(input: { title: string; seconds: number; assignmentId: string | null; source: "assigned" | "suggested" | "self" }): Promise<Result> {
  const me = await requireUser();
  const seconds = Math.round(Math.min(Math.max(input.seconds, 1), 7200));
  const supabase = await createClient();
  const assignment = input.assignmentId && UUID.test(input.assignmentId) ? input.assignmentId : null;
  const { error } = await supabase.from("recovery_sessions").insert({
    athlete_id: me.id,
    assignment_id: assignment,
    title: input.title.slice(0, 80) || "Recovery",
    seconds,
    source: assignment ? "assigned" : input.source === "suggested" ? "suggested" : "self",
  });
  if (error) return { ok: false, error: "Couldn't save. Your session still counts in spirit." };
  revalidatePath("/me");
  return { ok: true };
}
