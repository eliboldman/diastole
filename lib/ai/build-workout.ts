"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { AI_MODELS, costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";
import { AiLeaf as Leaf, AiRepeat as Repeat } from "@/lib/ai/step-schema";
import { leafToStep } from "@/lib/workouts/ai-steps";
import { validateSteps, type Pool, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { apiErrorText } from "@/lib/ai/api-error";

// Cheapest model first (Eli's rule); if its workout doesn't pass the Garmin checks, the coach's
// model gets one retry with the exact errors.
const FIRST: AiModel = "claude-haiku-5-5";
const MILE = 1609.344;
const UUID = /^[0-9a-f-]{36}$/i;

// ---------------------------------------------------------------- what Claude returns
// Plain units (m:ss paces in the coach's unit, % of FTP, yards/meters/miles); the server converts.

const Output = z.object({
  title: z.string().describe("short, e.g. 6 × 800 m at 5K pace"),
  sport: z.enum(["run", "bike", "swim"]),
  description: z.string().nullable().describe("one or two sentences for the athlete, only if the coach gave context"),
  steps: z.array(z.discriminatedUnion("kind", [Leaf, Repeat])),
  assumptions: z.string().nullable().describe("anything you had to assume or couldn't represent, for the coach; null if none"),
});

// ---------------------------------------------------------------- prompt

const SYSTEM = `You turn an endurance coach's description of one workout into structured steps for a Garmin watch. Follow the description exactly: don't add, drop or reorder anything the coach didn't ask for. If the coach didn't mention a warm-up or cool-down, don't invent one.

Rules:
- Steps: WARMUP, ACTIVE, INTERVAL, RECOVERY, REST, COOLDOWN (MAIN is swim-only). Use a repeat for "N x (...)"; repeats can't be nested; repeat count 2-99.
- Durations: time in seconds, distance with its unit (m, km, yd, mi), open (until lap button). For swims, distances are in the pool's unit and must be whole lengths; rest at the wall is a REST step with seconds, or a send-off ("on the 1:30") is a REST step with duration_type sendoff.
- Run targets: pace_range as m:ss in the given pace unit (fast end and slow end, about 10-15 s apart unless the coach gave exact paces), hr_zone 1-5, or hr_range bpm. Bike: power_pct_ftp (% of FTP), power_watts, or hr. Swim: swim_effort 1-10 or swim_pace_per_100 (m:ss per 100 of the pool unit), plus stroke, drill (kick/pull) and equipment when mentioned.
- Named efforts: when the coach says "easy", "tempo", "threshold", "5K pace", "Z2" and so on without numbers, derive them from the athlete's zones given (threshold pace, FTP, max HR). Rough guide from threshold pace T: 5K ~ T minus 4%, 10K ~ T minus 1%, half marathon ~ T plus 3%, marathon ~ T plus 8%, easy ~ T plus 22-30%. If the needed zone isn't known, use an hr_zone or no target, and say so in assumptions.
- Never use a pace or power target on a swim, or a swim target on a run or ride.
- title: short and specific. description: only if the coach gave context for the athlete. assumptions: brief note to the coach about anything you assumed or couldn't represent; null if nothing.`;

export type BuildResult =
  | { ok: true; title: string; sport: Sport; description: string | null; steps: Step[]; assumptions: string | null; costUsd: number }
  | { ok: false; error: string };

/** Build a workout from the coach's words. Returns steps for the builder to show; nothing is saved or sent. */
export async function buildWorkoutFromPrompt(input: {
  athleteId: string;
  prompt: string;
  sport: Sport | null; // the builder's current sport, as a hint
  paceUnit: "mi" | "km";
  pool: Pool;
}): Promise<BuildResult> {
  const me = await requireCoach();
  const text = input.prompt.replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!text) return { ok: false, error: "Describe the workout first." };
  if (!UUID.test(input.athleteId)) return { ok: false, error: "Unknown athlete." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is configured." };
  const supabase = await createClient();
  const admin = createAdminClient();

  // Only the coach's own athletes (or themself).
  const { data: athlete } = await supabase.from("profiles").select("id, full_name, coach_id").eq("id", input.athleteId).maybeSingle();
  if (!athlete || (athlete.id !== me.id && athlete.coach_id !== me.id)) return { ok: false, error: "That athlete isn't yours." };

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Me → Coaching assistant." };
  const spent = await monthToDateSpend(me.id);
  if (spent >= Number(settings.ai_monthly_cap_usd) - 0.01) return { ok: false, error: "Monthly AI cap reached." };

  const { data: zones } = await admin.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr").eq("athlete_id", input.athleteId).maybeSingle();
  const per = input.paceUnit === "mi" ? MILE : 1000;
  const thrPace = zones?.threshold_speed_mps ? Math.round(per / Number(zones.threshold_speed_mps)) : null;
  const context = {
    sport_hint: input.sport,
    pace_unit: input.paceUnit,
    pool: input.pool ? `${input.pool.length} ${input.pool.unit === "YARD" ? "yd" : "m"}` : null,
    zones: {
      threshold_pace: thrPace ? `${Math.floor(thrPace / 60)}:${String(thrPace % 60).padStart(2, "0")} per ${input.paceUnit}` : null,
      ftp_watts: zones?.ftp_w ?? null,
      max_hr: zones?.max_hr ?? null,
      threshold_hr: zones?.threshold_hr ?? null,
    },
  };

  const client = new Anthropic();
  let total = 0;
  const log = async (model: AiModel, r: { usage: Anthropic.Beta.BetaUsage; stop_reason: string | null }) => {
    const cost = costOf(model, r.usage);
    total += cost;
    await admin.from("ai_usage").insert({
      coach_id: me.id,
      model,
      athletes: 1,
      input_tokens: r.usage.input_tokens ?? 0,
      output_tokens: r.usage.output_tokens ?? 0,
      cache_read_tokens: r.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0,
      cost_usd: cost.toFixed(5),
      stop_reason: r.stop_reason,
      trigger: "build",
    });
  };

  const attempt = async (model: AiModel, fixes: string[] | null) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      { role: "user", content: `Athlete context (JSON): ${JSON.stringify(context)}\n\nThe coach's description:\n${text}` },
    ];
    if (fixes) messages[0] = { role: "user", content: `${messages[0].content as string}\n\nA previous attempt failed these checks; avoid them:\n- ${fixes.join("\n- ")}` };
    const r = await client.beta.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages,
    });
    await log(model, r);
    if (r.stop_reason === "refusal" || !r.parsed_output) return null;
    const o = r.parsed_output;
    const pool = o.sport === "swim" ? input.pool : null;
    const ctx = { paceUnit: input.paceUnit, ftp: zones?.ftp_w ?? null, pool };
    const steps: Step[] = o.steps.map((x) =>
      x.kind === "repeat" ? { kind: "repeat", times: x.times, steps: x.steps.map((l) => leafToStep(l, ctx)) } : leafToStep(x, ctx),
    );
    return { o, steps, errors: validateSteps(steps, 0, o.sport, pool) };
  };

  try {
    let res = await attempt(FIRST, null);
    if (!res || res.errors.length) {
      const strong = (settings.ai_model as AiModel) === FIRST ? ("claude-opus-5-5" as AiModel) : (settings.ai_model as AiModel);
      res = await attempt(strong, res?.errors ?? null);
    }
    if (!res) return { ok: false, error: "Claude couldn't turn that into a workout. Try describing it differently." };
    if (res.errors.length) return { ok: false, error: `That didn't pass the watch's checks: ${[...new Set(res.errors)].slice(0, 2).join(" ")}` };
    return {
      ok: true,
      title: res.o.title.trim().slice(0, 100),
      sport: res.o.sport,
      description: res.o.description?.trim().slice(0, 1024) || null,
      steps: res.steps,
      assumptions: res.o.assumptions?.trim() || null,
      costUsd: total,
    };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is busy right now. Try again in a moment." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "build-workout") };
    throw e;
  }
}
