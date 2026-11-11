"use server";

import { revalidatePath } from "next/cache";

import { strainFromSets } from "@/lib/avatar/strain";
import { resendWorkoutToGarmin } from "@/lib/garmin/training";
import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";
import { isKeySession } from "@/lib/training/alerts";
import type { Step } from "@/lib/workouts/garmin-format";

import { BY_SLUG } from "./catalog";
import { applyChanges, DEFAULT_RULES, heavyLegs, lightenLegs, progress, strengthLoad, type Change, type LoggedItem, type Rules, type StrengthItem } from "./workout";

const UUID = /^[0-9a-f-]{36}$/i;
const DAYMS = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAYMS).toISOString().slice(0, 10);
type Supa = Awaited<ReturnType<typeof createClient>>;

const cleanLogged = (raw: unknown): LoggedItem[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, 30)
    .filter((i): i is LoggedItem => Boolean(i && typeof i.slug === "string" && BY_SLUG.has(i.slug) && Array.isArray(i.sets)))
    .map((i) => ({
      slug: i.slug,
      sets: i.sets.slice(0, 12).map((s) => ({
        reps: Number.isFinite(Number(s.reps)) && Number(s.reps) > 0 ? Math.min(100, Math.round(Number(s.reps))) : null,
        kg: Number.isFinite(Number(s.kg)) && Number(s.kg) > 0 ? Math.min(500, Math.round(Number(s.kg) * 100) / 100) : null,
        seconds: Number.isFinite(Number(s.seconds)) && Number(s.seconds) > 0 ? Math.min(900, Math.round(Number(s.seconds))) : null,
      })),
    }))
    .filter((i) => i.sets.length);

/** The athlete finished a strength session: save it, count it, and work out next time's loads. */
export async function logStrength(input: { plannedWorkoutId: string | null; items: unknown; rpe: number | null; durationS: number; note?: string }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const me = await requireUser();
  const items = cleanLogged(input.items);
  if (!items.length) return { ok: false, error: "Log at least one set." };
  const rpe = input.rpe && input.rpe >= 1 && input.rpe <= 10 ? Math.round(input.rpe) : null;
  const durationS = Math.min(21600, Math.max(60, Math.round(input.durationS || 0)));
  const supabase = await createClient();
  let plan: { id: string; scheduled_date: string; strength: StrengthItem[] } | null = null;
  if (input.plannedWorkoutId) {
    if (!UUID.test(input.plannedWorkoutId)) return { ok: false, error: "Unknown workout." };
    const { data } = await supabase.from("planned_workouts").select("id, athlete_id, scheduled_date, strength").eq("id", input.plannedWorkoutId).maybeSingle();
    if (!data || data.athlete_id !== me.id) return { ok: false, error: "That workout isn't yours." };
    plan = { id: data.id, scheduled_date: data.scheduled_date, strength: (data.strength ?? []) as StrengthItem[] };
  }
  const admin = createAdminClient(); // athletes can't write activities directly; checked above
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone || "America/Chicago" });
  const started = new Date(Date.now() - durationS * 1000).toISOString();
  const { data: act, error: aErr } = await admin
    .from("activities")
    .insert({
      athlete_id: me.id,
      source: "diastole",
      external_id: `strength:${crypto.randomUUID()}`,
      sport: "strength_training",
      name: "Strength",
      start_time: started,
      duration_s: durationS,
      training_load: strengthLoad(durationS, rpe),
      planned_workout_id: plan?.id ?? null,
      raw: { strength: items, rpe },
    })
    .select("id")
    .single();
  if (aErr || !act) return { ok: false, error: "Couldn't save the session." };
  const sets = items.flatMap((i) => i.sets.map((s) => ({ category: BY_SLUG.get(i.slug)?.category ?? null, reps: s.reps, weight: s.kg, duration_s: s.seconds })));
  await admin.from("activity_strain").upsert({ activity_id: act.id, athlete_id: me.id, auto: strainFromSets(sets) }, { onConflict: "activity_id" });
  const { data: log } = await admin
    .from("strength_logs")
    .insert({ athlete_id: me.id, planned_workout_id: plan?.id ?? null, activity_id: act.id, date: today, items, rpe, duration_s: durationS, note: input.note?.trim().slice(0, 500) || null })
    .select("id")
    .single();

  let message = "Saved. Nice work.";
  if (plan && log) message = (await progressNext(admin, me.id, plan, items, rpe, log.id as string)) ?? message;
  revalidatePath("/me");
  revalidatePath("/training");
  return { ok: true, message };
}

/** After a session: next loads for the athlete's next strength session (applied or suggested). */
async function progressNext(admin: ReturnType<typeof createAdminClient>, athleteId: string, plan: { id: string; scheduled_date: string; strength: StrengthItem[] }, logged: LoggedItem[], rpe: number | null, logId: string) {
  const { data: next } = await admin
    .from("planned_workouts")
    .select("id, scheduled_date, strength, status, external_id")
    .eq("athlete_id", athleteId)
    .eq("sport", "strength")
    .is("deleted_at", null)
    .gt("scheduled_date", plan.scheduled_date)
    .order("scheduled_date")
    .limit(1)
    .maybeSingle();
  if (!next) return null;
  const nextItems = (next.strength ?? []) as StrengthItem[];
  // Key bike/run the day after the next session: no heavier legs, and heavy legs lightened.
  const { data: dayAfter } = await admin.from("planned_workouts").select("title, sport, steps").eq("athlete_id", athleteId).is("deleted_at", null).neq("status", "draft").eq("scheduled_date", addDays(next.scheduled_date, 1));
  const keyNext = (dayAfter ?? []).some((p) => (p.sport === "bike" || p.sport === "run") && isKeySession(p.title, (p.steps ?? []) as Step[], p.sport));
  const { data: r } = await admin.from("strength_rules").select("rules, auto").eq("athlete_id", athleteId).maybeSingle();
  const rules: Rules = { ...DEFAULT_RULES, ...((r?.rules ?? {}) as Partial<Rules>) };
  // Only change exercises the next session shares with this one at the same starting point.
  const shared = plan.strength.filter((p) => nextItems.some((n) => n.slug === p.slug && n.kg === p.kg && n.reps === p.reps && n.seconds === p.seconds));
  const changes: Change[] = progress(shared, logged, rpe, rules, keyNext);
  if (keyNext) {
    const after = applyChanges(nextItems, changes);
    for (const it of lightenLegs(after)) {
      const before = after.find((a) => a.slug === it.slug);
      if (before && before.kg !== it.kg && !changes.some((c) => c.slug === it.slug && c.to.kg !== before.kg))
        changes.push({ slug: it.slug, from: { kg: before.kg, reps: before.reps, seconds: before.seconds }, to: { kg: it.kg, reps: it.reps, seconds: it.seconds }, why: "Lighter: key session the next day" });
    }
  }
  if (!changes.length) return null;
  if (r?.auto) {
    await admin.from("planned_workouts").update({ strength: applyChanges(nextItems, changes) }).eq("id", next.id);
    if (next.status === "sent" && next.external_id && !String(next.external_id).startsWith("apple:")) await resendWorkoutToGarmin(next.id).catch(() => {});
    await admin.from("strength_suggestions").insert({ athlete_id: athleteId, log_id: logId, planned_workout_id: next.id, changes, status: "applied" });
    return "Saved. Your next session's weights are updated.";
  }
  await admin.from("strength_suggestions").insert({ athlete_id: athleteId, log_id: logId, planned_workout_id: next.id, changes, status: "pending" });
  return "Saved. Your coach will review next session's weights.";
}

// ---------------------------------------------------------------- coach

export async function saveStrengthRules(athleteId: string, rules: Rules, auto: boolean): Promise<{ ok: boolean; error?: string }> {
  await requireCoach();
  if (!UUID.test(athleteId)) return { ok: false, error: "Unknown athlete." };
  const clean: Rules = {
    upper_kg: Math.min(10, Math.max(0, Number(rules.upper_kg) || 0)),
    lower_kg: Math.min(20, Math.max(0, Number(rules.lower_kg) || 0)),
    easy_rpe: Math.min(9, Math.max(5, Math.round(Number(rules.easy_rpe) || 7))),
    drop_pct: Math.min(30, Math.max(0, Number(rules.drop_pct) || 0)),
  };
  const supabase = await createClient();
  const { error } = await supabase.from("strength_rules").upsert({ athlete_id: athleteId, rules: clean, auto: Boolean(auto), approved_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  revalidatePath(`/athlete/${athleteId}`);
  return error ? { ok: false, error: "Couldn't save." } : { ok: true };
}

async function loadSuggestion(supabase: Supa, id: string) {
  const { data } = await supabase.from("strength_suggestions").select("id, athlete_id, planned_workout_id, changes, status").eq("id", id).maybeSingle();
  return data;
}

export async function applyStrengthSuggestion(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Unknown suggestion." };
  const supabase = await createClient();
  const s = await loadSuggestion(supabase, id);
  if (!s || s.status !== "pending" || !s.planned_workout_id) return { ok: false, error: "Already handled." };
  const { data: w } = await supabase.from("planned_workouts").select("id, strength, status, external_id, deleted_at").eq("id", s.planned_workout_id).maybeSingle();
  if (!w || w.deleted_at) return { ok: false, error: "That session was removed." };
  await supabase.from("planned_workouts").update({ strength: applyChanges((w.strength ?? []) as StrengthItem[], s.changes as Change[]) }).eq("id", w.id);
  if (w.status === "sent" && w.external_id && !String(w.external_id).startsWith("apple:")) await resendWorkoutToGarmin(w.id).catch(() => {});
  await supabase.from("strength_suggestions").update({ status: "applied" }).eq("id", id);
  revalidatePath(`/athlete/${s.athlete_id}`);
  return { ok: true };
}

export async function dismissStrengthSuggestion(id: string): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false };
  const supabase = await createClient();
  const s = await loadSuggestion(supabase, id);
  if (!s) return { ok: false };
  await supabase.from("strength_suggestions").update({ status: "dismissed" }).eq("id", id);
  revalidatePath(`/athlete/${s.athlete_id}`);
  return { ok: true };
}

/** For the builder: heavy legs the day before a key bike/run on this athlete's calendar. */
export async function heavyLegsWarning(athleteId: string, date: string, items: StrengthItem[]): Promise<string | null> {
  await requireCoach();
  if (!UUID.test(athleteId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const heavy = heavyLegs(items);
  if (!heavy.length) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("planned_workouts").select("title, sport, steps").eq("athlete_id", athleteId).is("deleted_at", null).neq("status", "draft").eq("scheduled_date", addDays(date, 1));
  const key = (data ?? []).find((p) => (p.sport === "bike" || p.sport === "run") && isKeySession(p.title, (p.steps ?? []) as Step[], p.sport));
  return key ? `Heavy legs (${heavy.join(", ")}) the day before “${key.title}”. Consider moving it or going lighter.` : null;
}
