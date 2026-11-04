"use server";

import { revalidatePath } from "next/cache";

import { runCoachAssistant, type AiModel, AI_MODELS } from "@/lib/ai/coach";
import { removeWorkoutFromGarmin, sendWorkoutToGarmin } from "@/lib/garmin/training";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Sport, Step } from "@/lib/workouts/garmin-format";

export type AiResult = { ok: true; message: string; redirectTo?: string } | { ok: false; error: string };

type ProposedWorkout = { title: string; sport: Sport; scheduled_date: string; description: string; steps: Step[] };

async function loadSuggestion(id: string) {
  const supabase = await createClient(); // row-level security: only the coach's own suggestions
  const { data } = await supabase
    .from("ai_suggestions")
    .select("id, coach_id, athlete_id, action, status, target_workout_id, proposed_workout")
    .eq("id", id)
    .maybeSingle();
  return { supabase, s: data };
}

export async function runAssistantNow(): Promise<AiResult> {
  const coach = await requireCoach();
  const r = await runCoachAssistant(coach.id, "manual");
  revalidatePath("/dashboard");
  if (r.status === "skipped") return { ok: true, message: r.reason };
  return { ok: true, message: `${r.suggestions} suggestion${r.suggestions === 1 ? "" : "s"} ready ($${r.costUsd.toFixed(3)}).` };
}

/** Coach approval: apply the change and, for a new session, deliver it to the athlete's device. */
export async function approveSuggestion(id: string): Promise<AiResult> {
  const coach = await requireCoach();
  const { supabase, s } = await loadSuggestion(id);
  if (!s || s.status !== "pending") return { ok: false, error: "This suggestion was already handled." };

  const notes: string[] = [];
  const [{ data: athlete }, { data: realDevice }] = await Promise.all([
    supabase.from("profiles").select("is_test").eq("id", s.athlete_id).maybeSingle(),
    supabase.from("device_connections").select("source").eq("athlete_id", s.athlete_id).maybeSingle(),
  ]);
  // Hard guard: nothing ever reaches a watch for an AI test-mode athlete.
  const isTest = Boolean(athlete?.is_test);
  const device = isTest ? null : realDevice;

  // 1. Retire the planned session it replaces (rest / replace / easier swap).
  if (s.target_workout_id && s.action !== "keep") {
    const { data: old } = await supabase.from("planned_workouts").select("id, status, external_id").eq("id", s.target_workout_id).maybeSingle();
    if (old && old.status !== "skipped") {
      if (old.external_id && device?.source === "garmin") {
        try {
          await removeWorkoutFromGarmin(old.id);
          notes.push("Removed the original session from Garmin.");
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }
      await supabase.from("planned_workouts").update({ status: "skipped" }).eq("id", old.id);
    }
  }

  // 2. Create and deliver the proposed session, if any.
  let resultId: string | null = null;
  const w = s.proposed_workout as ProposedWorkout | null;
  if (w && s.action !== "keep" && s.action !== "rest") {
    const { data: created, error } = await supabase
      .from("planned_workouts")
      .insert({
        athlete_id: s.athlete_id,
        coach_id: coach.id,
        scheduled_date: w.scheduled_date,
        sport: w.sport,
        title: w.title,
        description: w.description || null,
        steps: w.steps,
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    resultId = created.id;
    if (device?.source === "garmin") {
      try {
        await sendWorkoutToGarmin(created.id);
        notes.push("New session sent to Garmin.");
      } catch (e) {
        notes.push(`New session saved, but sending to Garmin failed: ${(e as Error).message}`);
      }
    } else
      notes.push(
        isTest
          ? "Test athlete: new session saved, nothing sent to any watch."
          : device?.source === "apple"
            ? "New session waiting for the iPhone app."
            : "New session saved (no device yet).",
      );
  }

  await supabase
    .from("ai_suggestions")
    .update({ status: "approved", decided_at: new Date().toISOString(), result_workout_id: resultId })
    .eq("id", id);
  revalidatePath("/dashboard");
  revalidatePath(`/athlete/${s.athlete_id}`);
  return { ok: true, message: notes.join(" ") || "Approved." };
}

/** Opens the proposal in the workout builder as a draft, for the coach to adjust before sending. */
export async function editSuggestion(id: string): Promise<AiResult> {
  const coach = await requireCoach();
  const { supabase, s } = await loadSuggestion(id);
  if (!s || s.status !== "pending") return { ok: false, error: "This suggestion was already handled." };
  const w = s.proposed_workout as ProposedWorkout | null;
  if (!w) return { ok: false, error: "This suggestion has no workout to edit. Use the workout builder from the athlete page." };

  const { data: draft, error } = await supabase
    .from("planned_workouts")
    .insert({
      athlete_id: s.athlete_id,
      coach_id: coach.id,
      scheduled_date: w.scheduled_date,
      sport: w.sport,
      title: w.title,
      description: w.description || null,
      steps: w.steps,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await supabase
    .from("ai_suggestions")
    .update({ status: "edited", decided_at: new Date().toISOString(), result_workout_id: draft.id })
    .eq("id", id);
  revalidatePath("/dashboard");
  return { ok: true, message: "Opened as a draft.", redirectTo: `/athlete/${s.athlete_id}/workouts/${draft.id}` };
}

export async function dismissSuggestion(id: string): Promise<AiResult> {
  await requireCoach();
  const { supabase, s } = await loadSuggestion(id);
  if (!s || s.status !== "pending") return { ok: false, error: "This suggestion was already handled." };
  await supabase.from("ai_suggestions").update({ status: "dismissed", decided_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/dashboard");
  return { ok: true, message: "Dismissed." };
}

export async function saveAiSettings(input: { enabled: boolean; model: string; cap: number }): Promise<AiResult> {
  const coach = await requireCoach();
  if (!(input.model in AI_MODELS)) return { ok: false, error: "Unknown model." };
  if (!(input.cap >= 0 && input.cap <= 100)) return { ok: false, error: "Set a monthly cap between $0 and $100." };
  const supabase = await createClient();
  const { error } = await supabase.from("coach_settings").upsert({
    coach_id: coach.id,
    ai_enabled: input.enabled,
    ai_model: input.model as AiModel,
    ai_monthly_cap_usd: input.cap,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------- AI test mode

export async function createTestAthletes(): Promise<AiResult> {
  const coach = await requireCoach();
  const { seedTestAthletes } = await import("@/lib/ai/test-athletes");
  const n = await seedTestAthletes(coach.id);
  revalidatePath("/lab");
  return { ok: true, message: `${n} test athletes ready with fresh scenarios.` };
}

export async function runTestAnalysis(): Promise<AiResult> {
  const coach = await requireCoach();
  // Scenarios are built around "today"; if they were created on an earlier day, rebuild them first.
  const { seedTestAthletes, testScenariosAreStale } = await import("@/lib/ai/test-athletes");
  const refreshed = await testScenariosAreStale(coach.id);
  if (refreshed) await seedTestAthletes(coach.id);
  const r = await runCoachAssistant(coach.id, "test");
  revalidatePath("/lab");
  const prefix = refreshed ? "Scenarios were from an earlier day, so they were rebuilt for today. " : "";
  if (r.status === "skipped") return { ok: true, message: prefix + r.reason };
  return {
    ok: true,
    message: `${prefix}${r.suggestions} suggestion${r.suggestions === 1 ? "" : "s"} from ${AI_MODELS[r.model].label} ($${r.costUsd.toFixed(3)}).`,
  };
}

export async function deleteTestAthletes(): Promise<AiResult> {
  const coach = await requireCoach();
  const { removeTestAthletes } = await import("@/lib/ai/test-athletes");
  const n = await removeTestAthletes(coach.id);
  revalidatePath("/lab");
  return { ok: true, message: n ? `Removed ${n} test athletes and all their data.` : "No test athletes to remove." };
}
