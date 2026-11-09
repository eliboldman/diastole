"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { sportLabel } from "@/lib/activity/format";
import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { apiErrorText } from "@/lib/ai/api-error";

// A short draft: the cheapest model does it well (Eli's rule: cheapest model per job, small for drafts).
const WHY_MODEL: AiModel = "claude-haiku-5-5";
const UUID = /^[0-9a-f-]{36}$/i;

const SYSTEM = `You write the "why" for one planned endurance workout, in the coach's voice, speaking to the athlete.

Write 1 to 3 short sentences (under 280 characters total) that say what the session is for and what to focus on while doing it, and how it fits their current goal or training block when that's given. Plain words, second person, warm and direct. No headings, lists, emoji or quotation marks.

Use only facts in the input: never invent paces, heart rates, dates or race names. Don't give medical advice or mention injury. If readiness is yellow or red, you may say to keep it controlled, but don't change the workout.`;

const Output = z.object({ why: z.string().describe("1-3 sentences, under 280 characters") });

export type WhyResult = { ok: true; draft: string; costUsd: number } | { ok: false; error: string };

const money = (n: number) => `${"$"}${n.toFixed(2)}`;

type WorkoutForWhy = {
  athlete_id: string;
  title: string;
  sport: string;
  scheduled_date: string;
  description: string | null;
  steps: unknown;
  pool_length: number | null;
  pool_unit: string | null;
};

/** Draft a "why" for one of my athletes' saved workouts. Kept as a coach-only draft; nothing reaches the athlete. */
export async function draftWhy(workoutId: string): Promise<WhyResult> {
  const me = await requireCoach();
  if (!UUID.test(workoutId)) return { ok: false, error: "Unknown workout." };
  const supabase = await createClient();
  // Row-level security: only the coach of this athlete gets the row.
  const { data: w } = await supabase
    .from("planned_workouts")
    .select("id, athlete_id, coach_id, title, sport, scheduled_date, description, steps, pool_length, pool_unit")
    .eq("id", workoutId)
    .maybeSingle();
  if (!w || w.coach_id !== me.id) return { ok: false, error: "That workout isn't one of yours." };
  const r = await generateWhy(me.id, w);
  if (r.ok)
    await createAdminClient()
      .from("workout_why_drafts")
      .upsert({ workout_id: w.id, coach_id: me.id, draft: r.draft.slice(0, 600), model: WHY_MODEL, created_at: new Date().toISOString() });
  return r;
}

/**
 * Draft a "why" from what's in the builder right now (the workout may not be saved yet). The text
 * only fills the builder's field; it reaches the athlete when the coach saves the workout.
 */
export async function draftWhyForBuilder(input: {
  athleteId: string;
  title: string;
  sport: string;
  scheduledDate: string;
  description: string;
  steps: Step[];
  pool: Pool;
}): Promise<WhyResult> {
  const me = await requireCoach();
  if (!UUID.test(input.athleteId)) return { ok: false, error: "Unknown athlete." };
  const supabase = await createClient();
  const { data: athlete } = await supabase.from("profiles").select("id, coach_id").eq("id", input.athleteId).maybeSingle();
  if (!athlete || (athlete.id !== me.id && athlete.coach_id !== me.id)) return { ok: false, error: "That athlete isn't yours." };
  if (!input.steps.length) return { ok: false, error: "Add some steps first." };
  return generateWhy(me.id, {
    athlete_id: input.athleteId,
    title: input.title.trim() || "Workout",
    sport: input.sport,
    scheduled_date: input.scheduledDate,
    description: input.description.trim() || null,
    steps: input.steps,
    pool_length: input.pool?.length ?? null,
    pool_unit: input.pool?.unit ?? null,
  });
}

async function generateWhy(coachId: string, w: WorkoutForWhy): Promise<WhyResult> {
  const me = { id: coachId };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is configured." };
  const admin = createAdminClient();

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Me › Settings › Coaching assistant." };
  const spent = await monthToDateSpend(me.id);
  if (spent >= Number(settings.ai_monthly_cap_usd) - 0.01) return { ok: false, error: `Monthly AI cap reached (${money(spent)}).` };

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: athlete }, { data: goals }, { data: readiness }, { data: week }] = await Promise.all([
    admin.from("profiles").select("full_name, units").eq("id", w.athlete_id).maybeSingle(),
    admin.from("athlete_goals").select("race_name, race_date, block_name, block_ends").eq("athlete_id", w.athlete_id).maybeSingle(),
    admin.from("readiness_scores").select("date, overall, note").eq("athlete_id", w.athlete_id).order("date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("activities").select("sport, duration_s").eq("athlete_id", w.athlete_id).gte("start_time", weekAgo),
  ]);
  const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as PoolUnit } : null;
  const input = {
    athlete_first_name: (athlete?.full_name ?? "").split(" ")[0] || null,
    workout: {
      title: w.title,
      sport: sportLabel(w.sport),
      date: w.scheduled_date,
      coach_notes: w.description || null,
      steps: describe((w.steps ?? []) as Step[], athlete?.units === "km" ? "km" : "mi", pool, w.sport === "swim"),
    },
    goal_race: goals?.race_name ? { name: goals.race_name, date: goals.race_date } : null,
    training_block: goals?.block_name ? { name: goals.block_name, ends: goals.block_ends } : null,
    latest_readiness: readiness ? { date: readiness.date, flag: readiness.overall, note: readiness.note } : null,
    last_7_days: {
      workouts: week?.length ?? 0,
      hours: Math.round(((week ?? []).reduce((t, a) => t + (a.duration_s ?? 0), 0) / 3600) * 10) / 10,
    },
  };

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: WHY_MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      messages: [{ role: "user", content: `Planned workout and context (JSON):\n\n${JSON.stringify(input)}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is busy right now. Try again in a moment." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "why") };
    throw e;
  }

  const costUsd = costOf(WHY_MODEL, response.usage);
  await admin.from("ai_usage").insert({
    coach_id: me.id,
    model: WHY_MODEL,
    athletes: 1,
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cost_usd: costUsd.toFixed(5),
    stop_reason: response.stop_reason,
    trigger: "why",
  });
  if (response.stop_reason === "refusal") return { ok: false, error: "Claude declined to draft this one. Write it yourself." };
  const draft = response.parsed_output?.why?.replace(/\s+/g, " ").trim();
  if (!draft) return { ok: false, error: "The draft came back empty. Try again." };
  return { ok: true, draft, costUsd };
}

/** Save (approve) the why the athlete will see. Empty clears it. Coach only, via row-level security. */
export async function saveWhy(workoutId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireCoach();
  if (!UUID.test(workoutId)) return { ok: false, error: "Unknown workout." };
  const why = text.replace(/\s+/g, " ").trim().slice(0, 400) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("planned_workouts")
    .update({ why, why_updated_at: why ? new Date().toISOString() : null })
    .eq("id", workoutId)
    .eq("coach_id", me.id)
    .select("athlete_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Couldn't save that." };
  await supabase.from("workout_why_drafts").delete().eq("workout_id", workoutId);
  revalidatePath(`/athlete/${data.athlete_id}/workouts/${workoutId}`);
  revalidatePath(`/training/workouts/${workoutId}`);
  return { ok: true };
}
