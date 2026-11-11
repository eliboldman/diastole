"use server";

import { revalidatePath } from "next/cache";

import { sendToApple } from "@/lib/apple/send";
import { sendWorkoutToGarmin } from "@/lib/garmin/training";
import { draftRow, planFor } from "@/lib/plans/plan-for";
import { addDays, startMonday } from "@/lib/plans/template";
import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";
import { retireWorkout } from "@/lib/workouts/retire";

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const todayIn = (tz: string | null | undefined) => new Date().toLocaleDateString("en-CA", { timeZone: tz || "America/Chicago" });

function refresh(podId: string, campId?: string) {
  revalidatePath(`/pods/${podId}`);
  revalidatePath(`/me/pods/${podId}`);
  if (campId) {
    revalidatePath(`/pods/${podId}/camp/${campId}`);
    revalidatePath(`/me/pods/${podId}/camp/${campId}`);
  }
  revalidatePath("/me");
}

/** Coach: a camp in a pod from one of their plan templates (up to 4 weeks), with a collective goal. */
export async function createCamp(podId: string, input: { title: string; blurb?: string; templateId: string; startDate: string; goalMetric: "sessions" | "hours" | "distance"; goalValue: number }): Promise<Result> {
  await requireCoach();
  if (!UUID.test(podId) || !UUID.test(input.templateId)) return { ok: false, error: "Pick a plan." };
  if (!DATE.test(input.startDate)) return { ok: false, error: "Pick a start date." };
  const title = input.title?.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Give it a name." };
  const goal = Number(input.goalValue);
  if (!(goal > 0 && goal <= 100000)) return { ok: false, error: "Set a team goal." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("plan_templates").select("id, weeks").eq("id", input.templateId).maybeSingle();
  if (!t) return { ok: false, error: "That plan isn't in your library." };
  if (t.weeks > 4) return { ok: false, error: "Camps run up to 4 weeks. Pick a shorter plan, or save a block of it as its own plan." };
  const starts = startMonday({ weeks: t.weeks, raceWeek: false, startDate: input.startDate });
  if (starts < addDays(todayIn("America/Chicago"), -6)) return { ok: false, error: "Pick a start date from this week on." };
  const { data, error } = await supabase
    .from("pod_camps")
    .insert({ pod_id: podId, template_id: t.id, title, blurb: input.blurb?.trim().slice(0, 400) || null, starts_on: starts, ends_on: addDays(starts, t.weeks * 7 - 1), goal_metric: ["sessions", "hours", "distance"].includes(input.goalMetric) ? input.goalMetric : "sessions", goal_value: goal })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't create the camp." };
  refresh(podId, data.id);
  return { ok: true, id: data.id, message: "Camp created. Pod members see it on Today and can join." };
}

/** Coach: today's (or any day's) message to the camp. Empty removes it. */
export async function saveCampMessage(campId: string, date: string, body: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(campId) || !DATE.test(date)) return { ok: false, error: "Pick a day." };
  const supabase = await createClient();
  const { data: camp } = await supabase.from("pod_camps").select("pod_id, starts_on, ends_on").eq("id", campId).maybeSingle();
  if (!camp) return { ok: false, error: "Unknown camp." };
  if (date < camp.starts_on || date > camp.ends_on) return { ok: false, error: "That day isn't part of the camp." };
  const text = body.trim().slice(0, 600);
  const { error } = text ? await supabase.from("camp_messages").upsert({ camp_id: campId, date, body: text }, { onConflict: "camp_id,date" }) : await supabase.from("camp_messages").delete().eq("camp_id", campId).eq("date", date);
  refresh(camp.pod_id, campId);
  return error ? { ok: false, error: "Couldn't save." } : { ok: true, message: text ? "Posted." : "Removed." };
}

/** Coach: cancel a camp. Members' camp sessions from today on come off their calendars and watches. */
export async function cancelCamp(campId: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(campId)) return { ok: false, error: "Unknown camp." };
  const supabase = await createClient();
  const { data: camp } = await supabase.from("pod_camps").select("id, pod_id").eq("id", campId).maybeSingle();
  if (!camp) return { ok: false, error: "Unknown camp." };
  const admin = createAdminClient();
  const { data: members } = await admin.from("camp_members").select("athlete_id, application_id").eq("camp_id", campId).eq("status", "joined");
  for (const m of members ?? []) await removeFuture(admin, m.athlete_id, m.application_id);
  await supabase.from("pod_camps").delete().eq("id", campId);
  refresh(camp.pod_id);
  return { ok: true, message: "Camp cancelled." };
}

async function removeFuture(admin: ReturnType<typeof createAdminClient>, athleteId: string, applicationId: string | null) {
  if (!applicationId) return;
  const { data: prof } = await admin.from("profiles").select("timezone").eq("id", athleteId).maybeSingle();
  const { data: rows } = await admin.from("planned_workouts").select("id").eq("plan_application_id", applicationId).is("deleted_at", null).neq("status", "completed").gte("scheduled_date", todayIn(prof?.timezone));
  for (const w of rows ?? []) await retireWorkout(admin, w.id).catch(() => null);
}

/** The camp as the signed-in athlete may act on it: visible to them, in their pod, not over. */
async function campForMe(campId: string) {
  const me = await requireUser();
  if (!UUID.test(campId)) return null;
  const supabase = await createClient(); // row-level security: pod members and the coach
  const { data: camp } = await supabase.from("pod_camps").select("id, pod_id, coach_id, template_id, starts_on, ends_on, title").eq("id", campId).maybeSingle();
  if (!camp) return null;
  const { data: pm } = await supabase.from("pod_members").select("status").eq("pod_id", camp.pod_id).eq("athlete_id", me.id).maybeSingle();
  if (pm?.status !== "active") return null;
  return { me, camp };
}

/**
 * Athlete opts in: the camp's sessions go on their calendar, scaled to their zones and moved to
 * their training days, approved by the coach's camp and sent to their watch.
 */
export async function joinCamp(campId: string): Promise<Result> {
  const ctx = await campForMe(campId);
  if (!ctx) return { ok: false, error: "That camp isn't open to you." };
  const { me, camp } = ctx;
  const today = todayIn(me.timezone);
  if (camp.ends_on < today) return { ok: false, error: "That camp is over." };
  if (!camp.template_id) return { ok: false, error: "This camp's plan was removed. Ask your coach." };
  const admin = createAdminClient();
  const { data: existing } = await admin.from("camp_members").select("status").eq("camp_id", camp.id).eq("athlete_id", me.id).maybeSingle();
  if (existing?.status === "joined") return { ok: true, message: "You're already in." };
  const p = await planFor(admin, camp.template_id, me.id, { startDate: camp.starts_on });
  if (!p) return { ok: false, error: "Couldn't load the camp plan." };
  const { data: app, error } = await admin.from("plan_applications").insert({ template_id: camp.template_id, template_version: p.t.version, coach_id: camp.coach_id, athlete_id: me.id, start_date: p.start }).select("id").single();
  if (error || !app) return { ok: false, error: "Couldn't join right now." };
  const now = new Date().toISOString();
  const rows = p.items.filter((i) => !i.past && i.date <= camp.ends_on).map((i) => ({ ...draftRow(i, me.id, camp.coach_id, app.id as string), status: "approved", approved_at: now }));
  const { data: inserted } = rows.length ? await admin.from("planned_workouts").insert(rows).select("id") : { data: [] };
  await admin.from("camp_members").upsert({ camp_id: camp.id, athlete_id: me.id, status: "joined", application_id: app.id, updated_at: now }, { onConflict: "camp_id,athlete_id" });
  // Off to the watch, the same way the coach's Send does.
  const { data: device } = await admin.from("device_connections").select("source").eq("athlete_id", me.id).maybeSingle();
  let sent = 0;
  for (const w of inserted ?? []) {
    try {
      if (device?.source === "garmin") {
        await sendWorkoutToGarmin(w.id as string);
        sent++;
      } else if (device?.source === "apple") {
        if (!(await sendToApple(admin, w.id as string))) sent++;
      }
    } catch {
      // Stays approved; the coach sees it as unsent and can retry.
    }
  }
  refresh(camp.pod_id, camp.id);
  const n = inserted?.length ?? 0;
  return { ok: true, message: `You're in. ${n} session${n === 1 ? "" : "s"} on your calendar${sent ? `, ${sent} sent to your watch` : ""}, scaled to your zones.` };
}

export async function declineCamp(campId: string): Promise<Result> {
  const ctx = await campForMe(campId);
  if (!ctx) return { ok: false, error: "That camp isn't open to you." };
  await createAdminClient().from("camp_members").upsert({ camp_id: ctx.camp.id, athlete_id: ctx.me.id, status: "declined", updated_at: new Date().toISOString() }, { onConflict: "camp_id,athlete_id" });
  refresh(ctx.camp.pod_id, ctx.camp.id);
  return { ok: true, message: "No problem. You can still join until it ends." };
}

/** Life happens: step out. Sessions from today on come off; what you did still counts. */
export async function leaveCamp(campId: string): Promise<Result> {
  const ctx = await campForMe(campId);
  if (!ctx) return { ok: false, error: "That camp isn't open to you." };
  const admin = createAdminClient();
  const { data: m } = await admin.from("camp_members").select("application_id").eq("camp_id", ctx.camp.id).eq("athlete_id", ctx.me.id).maybeSingle();
  await removeFuture(admin, ctx.me.id, m?.application_id ?? null);
  await admin.from("camp_members").update({ status: "left", updated_at: new Date().toISOString() }).eq("camp_id", ctx.camp.id).eq("athlete_id", ctx.me.id);
  refresh(ctx.camp.pod_id, ctx.camp.id);
  return { ok: true, message: "You've stepped out. Everything you did still counts toward the team goal." };
}
