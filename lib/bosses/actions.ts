"use server";

import { revalidatePath } from "next/cache";

import { BOSS, LIMITERS, monthOf, type Limiter } from "@/lib/bosses/bosses";
import { measure, settleBoss, suggestBoss, valueFor } from "@/lib/bosses/data";
import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";

export type BossResult = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Run this month's limiter check for every athlete without a boss yet. */
export async function findBosses(): Promise<BossResult> {
  const coach = await requireCoach();
  const admin = createAdminClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const { data: roster } = await admin.from("profiles").select("id").eq("coach_id", coach.id).eq("is_test", false);
  let n = 0;
  for (const a of roster ?? []) if (await suggestBoss(admin, a.id, coach.id, today).catch(() => null)) n++;
  revalidatePath("/dashboard");
  return { ok: true, message: n ? `${n} new suggestion${n === 1 ? "" : "s"}.` : "No clear limiters right now. Everyone's numbers look balanced." };
}

async function own(id: string) {
  const coach = await requireCoach();
  if (!UUID.test(id)) return null;
  const admin = createAdminClient();
  const { data: b } = await admin.from("bosses").select("id, athlete_id, coach_id, limiter, status, month").eq("id", id).maybeSingle();
  return b && b.coach_id === coach.id ? { admin, b, coach } : null;
}

/** Approve (optionally swapping the limiter). The athlete meets the boss on their profile. */
export async function approveBoss(id: string, limiter?: Limiter): Promise<BossResult> {
  const o = await own(id);
  if (!o) return { ok: false, error: "Boss not found." };
  const { admin, b } = o;
  if (b.status !== "suggested") return { ok: false, error: "That one's already decided." };
  const pick = limiter && LIMITERS.includes(limiter) ? limiter : (b.limiter as Limiter);
  const patch: Record<string, unknown> = { status: "active", approved_at: new Date().toISOString(), limiter: pick };
  if (pick !== b.limiter) {
    // Swapped: a fresh starting number for the new limiter (if there's enough data for one).
    const v = valueFor(pick, await measure(admin, b.athlete_id, new Date(Date.now() - 56 * 86_400_000).toISOString()));
    patch.baseline = v?.value ?? null;
    patch.evidence = v?.line ?? "Chosen by your coach.";
  }
  const { error } = await admin.from("bosses").update(patch).eq("id", id);
  if (error) return { ok: false, error: "Couldn't approve that." };
  const meta = BOSS[pick];
  await admin.rpc("server_notify", { p_user: b.athlete_id, p_kind: "boss", p_title: `A boss appeared: ${meta.name}`, p_body: `${meta.intro} Your coach's sessions this month will wear it down.`, p_href: "/account", p_key: `boss:${id}` });
  await settleBoss(admin, b.athlete_id).catch(() => null);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function skipBoss(id: string): Promise<BossResult> {
  const o = await own(id);
  if (!o) return { ok: false, error: "Boss not found." };
  await o.admin.from("bosses").update({ status: "skipped" }).eq("id", id).eq("status", "suggested");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Coach picks a boss by hand for an athlete who has none this month. */
export async function chooseBoss(athleteId: string, limiter: Limiter): Promise<BossResult> {
  const coach = await requireCoach();
  if (!UUID.test(athleteId) || !LIMITERS.includes(limiter)) return { ok: false, error: "Pick a boss." };
  const admin = createAdminClient();
  const { data: a } = await admin.from("profiles").select("coach_id").eq("id", athleteId).maybeSingle();
  if (a?.coach_id !== coach.id) return { ok: false, error: "Athlete not found." };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const v = valueFor(limiter, await measure(admin, athleteId, new Date(Date.now() - 56 * 86_400_000).toISOString()));
  const { data, error } = await admin.from("bosses").insert({ athlete_id: athleteId, coach_id: coach.id, month: monthOf(today), limiter, status: "suggested", evidence: v?.line ?? "Chosen by your coach.", baseline: v?.value ?? null }).select("id").single();
  if (error) return { ok: false, error: "There's already a boss for this month." };
  return approveBoss(data.id);
}

/** Aim a planned session at this month's boss (or not). */
export async function setBossTarget(workoutId: string, on: boolean): Promise<BossResult> {
  await requireCoach();
  if (!UUID.test(workoutId)) return { ok: false, error: "Workout not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("planned_workouts").update({ targets_boss: on }).eq("id", workoutId).select("athlete_id").maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't change that." };
  revalidatePath(`/athlete/${data.athlete_id}`);
  return { ok: true };
}
