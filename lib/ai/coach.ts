import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { localDate, refreshReadiness } from "@/lib/readiness/run";
import { createAdminClient } from "@/lib/supabase/server";
import { validateSteps, type Step, type Target } from "@/lib/workouts/garmin-format";
import { apiErrorText } from "@/lib/ai/api-error";
import { cleanCloset, closetForPrompt } from "@/lib/closet";

// ---------------------------------------------------------------- models & pricing (USD per million tokens)

export const AI_MODELS = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", input: 4, output: 20, cacheRead: 0.2, fallbacks: true },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2, fallbacks: true },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", input: 0.1, output: 0.5, cacheRead: 0.01, fallbacks: false },
} as const;
export type AiModel = keyof typeof AI_MODELS;

export const DEFAULT_SETTINGS = { ai_enabled: true, ai_model: "claude-opus-5-5" as AiModel, ai_monthly_cap_usd: 5 };

export function costOf(model: AiModel, u: Anthropic.Beta.BetaUsage) {
  const p = AI_MODELS[model];
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  return (input * p.input + cacheWrite * p.input * 1.25 + cacheRead * p.cacheRead + output * p.output) / 1_000_000;
}

// ---------------------------------------------------------------- structured output schema

const Leaf = z.object({
  kind: z.literal("step"),
  intensity: z.enum(["WARMUP", "ACTIVE", "INTERVAL", "RECOVERY", "REST", "COOLDOWN"]),
  duration_type: z.enum(["time", "distance", "open"]),
  duration_seconds: z.number().nullable().describe("Seconds, when duration_type is time"),
  distance_meters: z.number().nullable().describe("Meters, when duration_type is distance"),
  target_type: z.enum(["none", "hr_zone", "hr_range", "pace_range", "power_range"]),
  hr_zone: z.number().int().nullable().describe("1-5, when target_type is hr_zone"),
  range_low: z.number().nullable().describe("bpm or watts, for hr_range / power_range"),
  range_high: z.number().nullable().describe("bpm or watts, for hr_range / power_range"),
  pace_slow_sec_per_km: z.number().nullable().describe("for pace_range"),
  pace_fast_sec_per_km: z.number().nullable().describe("for pace_range"),
  note: z.string().nullable(),
});
const Repeat = z.object({ kind: z.literal("repeat"), times: z.number().int(), steps: z.array(Leaf) });

const SuggestionSchema = z.object({
  athlete_id: z.string(),
  concern: z.enum(["low", "medium", "high"]),
  summary: z.string().describe("2-3 sentences for the coach: what the data shows and why it matters today"),
  action: z.enum(["keep", "reduce_intensity", "easy_session", "rest", "replace"]),
  rationale: z.string().describe("1-2 sentences explaining the proposed change"),
  target_workout_id: z.string().nullable().describe("id of the upcoming planned workout this changes, if any"),
  proposed_workout: z
    .object({
      title: z.string(),
      sport: z.enum(["run", "bike"]),
      scheduled_date: z.string().describe("YYYY-MM-DD"),
      description: z.string(),
      steps: z.array(z.discriminatedUnion("kind", [Leaf, Repeat])),
    })
    .nullable()
    .describe("A full replacement session, when the action changes or adds a workout; otherwise null"),
});
const OutputSchema = z.object({ suggestions: z.array(SuggestionSchema) });
type AiLeaf = z.infer<typeof Leaf>;

function toStep(s: AiLeaf): Step {
  const duration =
    s.duration_type === "time" && s.duration_seconds
      ? ({ type: "time", seconds: Math.round(s.duration_seconds) } as const)
      : s.duration_type === "distance" && s.distance_meters
        ? ({ type: "distance", meters: Math.round(s.distance_meters) } as const)
        : ({ type: "open" } as const);
  let target: Target | undefined;
  if (s.target_type === "hr_zone" && s.hr_zone && s.hr_zone >= 1 && s.hr_zone <= 5) target = { type: "hr_zone", zone: s.hr_zone as 1 };
  else if (s.target_type === "hr_range" && s.range_low && s.range_high) target = { type: "hr_range", low: s.range_low, high: s.range_high };
  else if (s.target_type === "power_range" && s.range_low && s.range_high) target = { type: "power_range", low: s.range_low, high: s.range_high };
  else if (s.target_type === "pace_range" && s.pace_slow_sec_per_km && s.pace_fast_sec_per_km)
    target = { type: "pace_range", slowSecPerKm: s.pace_slow_sec_per_km, fastSecPerKm: s.pace_fast_sec_per_km };
  return { kind: "step", intensity: s.intensity, duration, ...(target ? { target } : {}), ...(s.note ? { note: s.note } : {}) };
}

// ---------------------------------------------------------------- prompt

const SYSTEM = `You are an assistant to an endurance coach who coaches a small group of college athletes. Each morning you review athletes whose readiness was flagged yellow (caution) or red (recover) and propose how the coach might adjust their next sessions.

How readiness works: each athlete is compared to their own rolling 28-day baseline. Recovery = HRV (lower is worse) and resting heart rate (higher is worse). Sleep = duration and sleep score. Stress = Garmin all-day stress and Body Battery. Load = last 7 days of heart-rate-weighted training minutes vs. their usual week. HRV from Garmin and Apple use different scales, so only compare an athlete to their own history.

Guidelines:
- Base every statement on the data provided. Say plainly when data is thin (few days of baseline, missing nights).
- Prefer the smallest change that addresses the flag: keep the plan if the flag is mild and the next session is easy; reduce intensity or swap to an easy session for caution; recommend rest when several markers are suppressed together or load is spiking.
- Only reference a target_workout_id that appears in that athlete's upcoming workouts. Use action "replace" or include proposed_workout only when you are proposing a concrete session; for "keep" and "rest", proposed_workout is null.
- Proposed workouts are run or bike only, use simple structure (warm-up, main set, cool-down), and prefer heart-rate zone targets (zone 1-2 for easy days). If the athlete's closet is given, only propose what their gear allows (for example an indoor ride only with a trainer).
- This is training guidance for a coach, not medical advice. Never diagnose. If the data could indicate illness, injury or overtraining, say the coach may want to check in with the athlete.
- Write for a busy coach: short, specific, no filler. Return exactly one suggestion per athlete provided.`;

type AthletePayload = Record<string, unknown> & { athlete_id: string; name: string };

async function buildPayload(athleteId: string, name: string, timeZone: string): Promise<AthletePayload> {
  const admin = createAdminClient();
  const today = localDate(new Date(), timeZone);
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
  const until = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

  const [{ data: readiness }, { data: wellness }, { data: activities }, { data: upcoming }, { data: gear }] = await Promise.all([
    admin.from("readiness_scores").select("date, overall, recovery, sleep, stress, load, note, details").eq("athlete_id", athleteId).order("date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("daily_wellness").select("date, source, hrv_ms, resting_hr, sleep_seconds, sleep_score, stress_avg, body_battery_high").eq("athlete_id", athleteId).gte("date", since).order("date"),
    admin.from("activities").select("sport, start_time, duration_s, distance_m, avg_hr, max_hr").eq("athlete_id", athleteId).gte("start_time", since).order("start_time"),
    admin.from("planned_workouts").select("id, scheduled_date, title, sport, status, steps").eq("athlete_id", athleteId).is("deleted_at", null).gte("scheduled_date", today).lte("scheduled_date", until).neq("status", "draft").order("scheduled_date"),
    admin.from("athlete_gear").select("gear").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  return {
    athlete_id: athleteId,
    name,
    today,
    readiness,
    wellness_last_14_days: wellness ?? [],
    activities_last_14_days: (activities ?? []).map((a) => ({
      date: localDate(new Date(a.start_time), timeZone),
      sport: a.sport,
      minutes: a.duration_s ? Math.round(a.duration_s / 60) : null,
      km: a.distance_m ? +(a.distance_m / 1000).toFixed(1) : null,
      avg_hr: a.avg_hr,
      max_hr: a.max_hr,
    })),
    upcoming_workouts_next_3_days: upcoming ?? [],
    closet: closetForPrompt(cleanCloset(gear?.gear)),
  };
}

// ---------------------------------------------------------------- the morning run

export type RunResult =
  | { status: "skipped"; reason: string }
  | { status: "done"; suggestions: number; costUsd: number; model: AiModel };

export async function monthToDateSpend(coachId: string) {
  const admin = createAdminClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("ai_usage").select("cost_usd").eq("coach_id", coachId).gte("created_at", start.toISOString());
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
}

/**
 * Morning analysis. "cron"/"manual" review the coach's real athletes; "test" reviews only AI test-mode
 * athletes and re-runs even if they already have a suggestion today (their old ones are cleared).
 */
export async function runCoachAssistant(coachId: string, trigger: "cron" | "manual" | "test"): Promise<RunResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { status: "skipped", reason: "No Anthropic API key configured." };
  const admin = createAdminClient();

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coachId).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const model = settings.ai_model as AiModel;
  if (!settings.ai_enabled) return { status: "skipped", reason: "The coaching assistant is turned off in Settings." };

  const spent = await monthToDateSpend(coachId);
  const cap = Number(settings.ai_monthly_cap_usd);
  if (spent >= cap - 0.02) return { status: "skipped", reason: `Monthly cap reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}).` };

  // Fresh readiness for every athlete, then pick the flagged ones without a suggestion today.
  const testMode = trigger === "test";
  const { data: roster } = await admin
    .from("profiles")
    .select("id, full_name, email, timezone")
    .eq("coach_id", coachId)
    .eq("is_test", testMode);
  if (testMode && roster?.length) {
    await admin.from("ai_suggestions").delete().in("athlete_id", roster.map((a) => a.id));
  }
  const flagged: { id: string; name: string; timezone: string; overall: "yellow" | "red"; today: string }[] = [];
  for (const a of roster ?? []) {
    const r = await refreshReadiness(a.id).catch(() => null);
    if (!r || (r.overall !== "yellow" && r.overall !== "red")) continue;
    const { data: existing } = await admin.from("ai_suggestions").select("id").eq("athlete_id", a.id).eq("date", r.date).maybeSingle();
    if (existing) continue;
    flagged.push({ id: a.id, name: a.full_name || a.email || "Athlete", timezone: a.timezone, overall: r.overall, today: r.date });
  }
  if (!flagged.length)
    return {
      status: "skipped",
      reason: testMode && !roster?.length ? "No test athletes yet. Create them first." : "No new yellow or red flags today. Nothing sent to Claude.",
    };

  const payload = await Promise.all(flagged.map((a) => buildPayload(a.id, a.name, a.timezone)));

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(OutputSchema) },
      // Opus/Sonnet: if a safety classifier declines, Anthropic re-runs the request on its recommended fallback.
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [
        {
          role: "user",
          content: `Flagged athletes this morning (JSON):\n\n${JSON.stringify(payload)}`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: "skipped", reason: "Claude API rate limit — try again shortly." };
    if (e instanceof Anthropic.AuthenticationError) return { status: "skipped", reason: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { status: "skipped", reason: apiErrorText(e, "coach") };
    throw e;
  }

  const costUsd = costOf(model, response.usage);
  const { data: usageRow } = await admin
    .from("ai_usage")
    .insert({
      coach_id: coachId,
      model,
      athletes: flagged.length,
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cost_usd: costUsd.toFixed(5),
      stop_reason: response.stop_reason,
      trigger,
    })
    .select("id")
    .single();

  if (response.stop_reason === "refusal") return { status: "skipped", reason: "Claude declined this request. Nothing was stored." };
  const parsed = response.parsed_output;
  if (!parsed) return { status: "skipped", reason: `Claude's answer couldn't be read (stop reason: ${response.stop_reason}).` };

  let stored = 0;
  for (const sug of parsed.suggestions) {
    const athlete = flagged.find((a) => a.id === sug.athlete_id);
    if (!athlete) continue; // ignore anything not about a flagged athlete

    const upcoming = (payload.find((p) => p.athlete_id === athlete.id)?.upcoming_workouts_next_3_days ?? []) as { id: string }[];
    const targetId = sug.target_workout_id && upcoming.some((w) => w.id === sug.target_workout_id) ? sug.target_workout_id : null;

    let proposed = null;
    if (sug.proposed_workout) {
      const steps: Step[] = sug.proposed_workout.steps.map((s) =>
        s.kind === "repeat" ? { kind: "repeat", times: s.times, steps: s.steps.map(toStep) } : toStep(s),
      );
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(sug.proposed_workout.scheduled_date) && sug.proposed_workout.scheduled_date >= athlete.today;
      if (!validateSteps(steps).length && validDate) proposed = { ...sug.proposed_workout, steps };
    }

    const { error } = await admin.from("ai_suggestions").insert({
      coach_id: coachId,
      athlete_id: athlete.id,
      date: athlete.today,
      overall: athlete.overall,
      concern: sug.concern,
      summary: sug.summary,
      action: sug.action,
      rationale: sug.rationale,
      target_workout_id: targetId,
      proposed_workout: proposed,
      usage_id: usageRow?.id ?? null,
    });
    if (!error) stored++;
  }

  return { status: "done", suggestions: stored, costUsd, model };
}
