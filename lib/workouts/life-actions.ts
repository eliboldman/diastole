"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";
import { applyRamp, applyToWorkout, type ChangeProposal } from "@/lib/workouts/apply";
import type { Sport, Step } from "@/lib/workouts/garmin-format";
import { buildRamp, planLife, type LifeReason } from "@/lib/workouts/life";

type Result = { ok: true; summary: string; why: string; status: "auto" | "pending" | "none" } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const REASONS: LifeReason[] = ["minutes", "feeling_off", "missed", "cant_today"];
const day = (tz: string, n = 0) => new Date(Date.now() + n * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });
const firstName = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "An athlete";

/** The athlete says what happened. Small changes apply now; bigger ones wait for the coach. */
export async function lifeHappened(input: { workoutId: string; reason: LifeReason; minutes?: number }): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(input.workoutId) || !REASONS.includes(input.reason)) return { ok: false, error: "Something's off. Try again." };
  const admin = createAdminClient();
  const { data: w } = await admin
    .from("planned_workouts")
    .select("id, athlete_id, coach_id, title, sport, steps, scheduled_date, status, deleted_at")
    .eq("id", input.workoutId)
    .eq("athlete_id", me.id)
    .maybeSingle();
  if (!w || w.deleted_at || !["approved", "sent"].includes(w.status)) return { ok: false, error: "That workout can't be changed." };

  const today = day(me.timezone);
  const [{ data: ready }, { data: upcoming }] = await Promise.all([
    admin.from("readiness_scores").select("overall").eq("athlete_id", me.id).eq("date", today).maybeSingle(),
    admin.from("planned_workouts").select("scheduled_date").eq("athlete_id", me.id).is("deleted_at", null).gte("scheduled_date", day(me.timezone, 1)).lte("scheduled_date", day(me.timezone, 4)),
  ]);
  const busy = new Set((upcoming ?? []).map((u) => u.scheduled_date));
  const freeDays = [1, 2, 3, 4].map((n) => day(me.timezone, n)).filter((d) => !busy.has(d));
  const plan = planLife({ reason: input.reason, workout: { title: w.title, sport: w.sport as Sport, steps: w.steps as Step[], scheduled_date: w.scheduled_date }, minutes: input.minutes, readiness: (ready?.overall as string) ?? null, freeDays });
  if (!plan.proposal) return { ok: true, summary: plan.summary, why: plan.why, status: "none" };

  // Self-coached (or no coach): the athlete decides everything themselves.
  const coach = w.coach_id && w.coach_id !== me.id ? w.coach_id : null;
  const auto = plan.auto || !coach;
  if (auto) {
    const err = await applyToWorkout(admin, w.id, plan.proposal as Exclude<ChangeProposal, { action: "ramp" }>, me.id, `Life happened: ${plan.summary.toLowerCase()}`);
    if (err) return { ok: false, error: err };
  }
  await admin.from("plan_changes").insert({ athlete_id: me.id, coach_id: coach, workout_id: w.id, reason: input.reason, summary: plan.summary, why: plan.why, proposal: plan.proposal, status: auto ? "auto" : "pending" });
  if (coach) {
    await admin.rpc("server_notify", {
      p_user: coach,
      p_kind: "plan_change",
      p_title: auto ? `${firstName(me.full_name)}: ${plan.summary}` : `${firstName(me.full_name)} asks: ${plan.summary}`,
      p_body: auto ? `${w.title}. A small change, already made. ${plan.why}` : `${w.title}. Approve or keep the plan in one tap.`,
      p_href: "/dashboard#changes",
      p_key: `plan_change:${w.id}:${input.reason}:${Date.now()}`,
    });
  }
  revalidatePath("/me");
  return { ok: true, summary: plan.summary, why: auto ? plan.why : `${plan.why} You'll get a notification when they answer.`, status: auto ? "auto" : "pending" };
}

/** The coach approves or declines a pending change (including a return ramp). */
export async function decidePlanChange(id: string, approve: boolean): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  // Row-level security: only the coach's own athletes.
  const { data: c } = await supabase.from("plan_changes").select("id, athlete_id, workout_id, summary, proposal, status").eq("id", id).maybeSingle();
  if (!c || c.status !== "pending") return { ok: false, error: "Already handled." };
  const admin = createAdminClient();
  if (approve) {
    const p = c.proposal as ChangeProposal;
    const err = p.action === "ramp" ? await applyRamp(admin, c.athlete_id, p.workouts) : c.workout_id ? await applyToWorkout(admin, c.workout_id, p, me.id, `Coach approved: ${c.summary.toLowerCase()}`) : "Nothing to change.";
    if (err) return { ok: false, error: err };
  }
  await admin.from("plan_changes").update({ status: approve ? "approved" : "declined", decided_at: new Date().toISOString() }).eq("id", c.id);
  await admin.rpc("server_notify", {
    p_user: c.athlete_id,
    p_kind: "workout_changed",
    p_title: approve ? `Coach said yes: ${c.summary}` : "Coach kept the plan as is",
    p_body: approve ? "Your plan is updated." : `About “${c.summary}”. Message them if you'd like to talk it through.`,
    p_href: "/me",
    p_key: `plan_decided:${c.id}`,
  });
  revalidatePath("/dashboard");
  return { ok: true, message: approve ? "Done. Their plan is updated." : "Kept as planned." };
}

// ---------------------------------------------------------------- sick / injured

/** Pause the plan: the next week's sessions come off the calendar and watch, and the coach is told. */
export async function startPause(input: { kind: "sick" | "injured"; note: string }): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const me = await requireUser();
  if (!["sick", "injured"].includes(input.kind)) return { ok: false, error: "Pick sick or injured." };
  const admin = createAdminClient();
  const today = day(me.timezone);
  const note = input.note.replace(/\s+/g, " ").trim().slice(0, 200);
  await admin.from("profiles").update({ health_pause: { kind: input.kind, since: today, note } }).eq("id", me.id);
  const { data: upcoming } = await admin.from("planned_workouts").select("id, title").eq("athlete_id", me.id).is("deleted_at", null).in("status", ["approved", "sent"]).gte("scheduled_date", today).lte("scheduled_date", day(me.timezone, 7));
  let removed = 0;
  for (const w of upcoming ?? []) {
    const err = await applyToWorkout(admin, w.id, { action: "skip" }, me.id, `Paused: ${input.kind}`);
    if (!err) removed++;
  }
  if (me.coach_id && me.coach_id !== me.id) {
    await admin.rpc("server_notify", {
      p_user: me.coach_id,
      p_kind: "plan_change",
      p_title: `${firstName(me.full_name)} is ${input.kind === "sick" ? "sick" : "injured"}: plan paused`,
      p_body: `${removed} session${removed === 1 ? "" : "s"} in the next week came off their calendar.${note ? ` “${note}”` : ""} You can restore them from Recently removed.`,
      p_href: `/athlete/${me.id}`,
      p_key: `pause:${me.id}:${today}`,
    });
  }
  revalidatePath("/me");
  return { ok: true, removed };
}

/** A quick daily symptom check while paused. */
export async function logSymptoms(input: { symptoms: string[]; energy: number | null; note: string }) {
  const me = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("symptom_logs").upsert({
    athlete_id: me.id,
    date: day(me.timezone),
    symptoms: [...new Set(input.symptoms.map((s) => s.slice(0, 30)))].slice(0, 12),
    energy: input.energy && input.energy >= 1 && input.energy <= 5 ? Math.round(input.energy) : null,
    note: input.note.trim().slice(0, 300) || null,
  });
  revalidatePath("/me");
  return error ? { ok: false as const, error: "Couldn't save." } : { ok: true as const };
}

/** Feeling better: unpause and propose a gentle ramp. With a coach, it waits for their OK. */
export async function endPause(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await requireUser();
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("health_pause").eq("id", me.id).maybeSingle();
  const pause = p?.health_pause as { kind: string; since: string } | null;
  if (!pause) return { ok: true, message: "You're not paused." };
  await admin.from("profiles").update({ health_pause: null }).eq("id", me.id);
  const today = day(me.timezone);
  const daysOff = Math.max(1, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${pause.since}T12:00:00Z`)) / 86_400_000));
  const coach = me.coach_id && me.coach_id !== me.id ? me.coach_id : null;
  revalidatePath("/me");
  if (!coach) return { ok: true, message: "Welcome back. Ease in with a few short, easy sessions." };

  // Their main sport over the last month.
  const { data: acts } = await admin.from("activities").select("sport").eq("athlete_id", me.id).gte("start_time", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(200);
  const count = { run: 0, bike: 0, swim: 0 };
  for (const a of acts ?? []) {
    const s = a.sport ?? "";
    if (/swim/i.test(s)) count.swim++;
    else if (/cycl|bik|ride/i.test(s)) count.bike++;
    else if (/run/i.test(s)) count.run++;
  }
  const sport = (Object.entries(count).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(count).sort((a, b) => b[1] - a[1])[0][0] : "run") as Sport;
  const workouts = buildRamp({ daysOff, sport, start: day(me.timezone, 1) });
  const summary = `Ease back in: ${workouts.length} easy sessions over ${Math.round((Date.parse(`${workouts[workouts.length - 1].date}T12:00:00Z`) - Date.parse(`${workouts[0].date}T12:00:00Z`)) / 86_400_000) + 1} days`;
  await admin.from("plan_changes").insert({ athlete_id: me.id, coach_id: coach, reason: "return", summary, why: `Back after ${daysOff} day${daysOff === 1 ? "" : "s"} ${pause.kind}.`, proposal: { action: "ramp", workouts }, status: "pending" });
  await admin.rpc("server_notify", {
    p_user: coach,
    p_kind: "plan_change",
    p_title: `${firstName(me.full_name)} is feeling better`,
    p_body: `${summary}. Approve it to send, or plan it yourself.`,
    p_href: "/dashboard#changes",
    p_key: `return:${me.id}:${today}`,
  });
  return { ok: true, message: "Welcome back. Your coach will confirm an easy return plan; rest or move gently until then." };
}
