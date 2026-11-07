import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { detectPatterns, FORM, type Pattern } from "@/lib/activity/form";
import { recentFormRuns } from "@/lib/activity/form-store";
import { AI_MODELS, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { createAdminClient } from "@/lib/supabase/server";
import { apiErrorText } from "@/lib/ai/api-error";

// Form insights: when a running-form issue shows up across several runs, Claude writes a short note
// for the coach and picks workouts or drills from the coach's own library. Nothing goes to an athlete:
// the coach adds a pick as a draft, then approves and sends it as usual.
//
// Claude is only called when the deterministic pattern check finds something new, so most days cost $0.

const RECENT_DAYS = 14; // the latest run in a pattern must be this recent
const QUIET_DAYS = 21; // don't raise the same issue for an athlete more often than this

const Output = z.object({
  insights: z.array(
    z.object({
      athlete_id: z.string(),
      issue_key: z.string().describe("Exactly one of the issue keys given for this athlete"),
      summary: z.string().describe("2-3 sentences for the coach: what the runs show, in plain words, and why it may matter"),
      drills: z.array(z.string()).describe("Up to 4 short drill or cue ideas, each under 15 words"),
      picks: z
        .array(z.object({ library_id: z.string(), reason: z.string().describe("One short sentence") }))
        .describe("0-3 workouts from the coach's library that address this; only ids from the list given"),
    }),
  ),
});

const SYSTEM = `You help an endurance coach who coaches a small group of college runners. You receive running-form patterns that a rule-based check found across each athlete's recent runs (from Garmin running dynamics), plus the coach's workout library.

For each issue given, write a short note for the coach and suggest what they could add.

Guidelines:
- Base everything on the numbers given. Mention that pace, terrain, shoes and fatigue all move these metrics, so one pattern is a prompt to look closer, not a verdict.
- Typical levers: cadence and ground contact time respond to strides, short hill sprints and cadence cues; vertical oscillation and vertical ratio to drills like A-skips, quick-feet and posture cues; balance asymmetries to single-leg strength and the coach checking in about niggles; late-run drift to aerobic durability and pacing.
- Picks must come from the library list by id. Prefer short sessions or drill-focused workouts that fit the issue; pick none if nothing fits.
- This is training guidance, not medical advice. Never diagnose. If an asymmetry or sudden change could mean pain or injury, say the coach may want to check in with the athlete.
- Plain, specific, no filler. Return one insight per issue key provided.`;

export type FormRunResult = { status: "skipped"; reason: string } | { status: "done"; insights: number; costUsd: number; model: AiModel };

function costOf(model: AiModel, u: Anthropic.Beta.BetaUsage) {
  const p = AI_MODELS[model];
  return ((u.input_tokens ?? 0) * p.input + (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.output_tokens ?? 0) * p.output) / 1_000_000;
}

const describePattern = (p: Pattern) =>
  `${p.key}: ${FORM[p.metric].label} ${p.kind === "level" ? "flagged (outside the common range or worse than usual)" : "drifting worse in the last third of the run"} in ${p.runs} of ${p.of} recent runs. ${p.detail}`;

export async function runFormInsights(coachId: string, trigger: "cron" | "manual", onlyAthlete?: string): Promise<FormRunResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { status: "skipped", reason: "No Anthropic API key configured." };
  const admin = createAdminClient();

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coachId).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const model = settings.ai_model as AiModel;
  if (!settings.ai_enabled) return { status: "skipped", reason: "The coaching assistant is turned off in Settings." };
  const spent = await monthToDateSpend(coachId);
  const cap = Number(settings.ai_monthly_cap_usd);
  if (spent >= cap - 0.02) return { status: "skipped", reason: `Monthly cap reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}).` };

  let rosterQ = admin.from("profiles").select("id, full_name, email, timezone").eq("coach_id", coachId).eq("is_test", false);
  if (onlyAthlete) rosterQ = rosterQ.eq("id", onlyAthlete);
  const { data: roster } = await rosterQ;

  const recentCutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const quietSince = new Date(Date.now() - QUIET_DAYS * 86_400_000).toISOString();
  const work: { athlete_id: string; first_name: string; issues: Pattern[]; recent_runs: unknown[] }[] = [];

  for (const a of roster ?? []) {
    const runs = await recentFormRuns(admin, a.id, { limit: 25, timeZone: a.timezone });
    if (!runs.length || new Date(runs[0].start_time).getTime() < recentCutoff) continue;
    const { data: raised } = await admin.from("form_insights").select("issue_key").eq("athlete_id", a.id).gte("created_at", quietSince);
    const already = new Set((raised ?? []).map((r) => r.issue_key));
    const issues = detectPatterns(runs).filter((p) => !already.has(p.key));
    if (!issues.length) continue;
    work.push({
      athlete_id: a.id,
      first_name: (a.full_name || a.email || "Athlete").split(/[\s@]/)[0],
      issues,
      recent_runs: runs.slice(0, 5).map((r) => ({
        date: r.date,
        minutes: Math.round(r.form.moving_s / 60),
        ...Object.fromEntries(Object.entries(r.form.metrics).map(([m, v]) => [m, { avg: v.avg, first_third: v.first, last_third: v.last }])),
      })),
    });
  }
  if (!work.length) return { status: "skipped", reason: "No new running-form patterns. Nothing sent to Claude." };

  const { data: library } = await admin
    .from("workout_library")
    .select("id, title, sport, workout_type, tags, description")
    .eq("coach_id", coachId)
    .eq("sport", "run")
    .order("use_count", { ascending: false })
    .limit(150);
  const lib = (library ?? []).map((w) => ({ id: w.id, title: w.title, type: w.workout_type, tags: w.tags, description: (w.description ?? "").slice(0, 200) }));
  const libIds = new Map(lib.map((w) => [w.id, w.title]));

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [
        {
          role: "user",
          content: `Units: cadence steps/min, gct ground contact ms, gct_bal % left, vo vertical oscillation mm, vr vertical ratio %, stride m, power W.

Athletes and issues (JSON):
${JSON.stringify(work.map((w) => ({ ...w, issues: w.issues.map(describePattern) })))}

Coach's run library (JSON):
${JSON.stringify(lib)}`,
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: "skipped", reason: "Claude API rate limit — try again shortly." };
    if (e instanceof Anthropic.AuthenticationError) return { status: "skipped", reason: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { status: "skipped", reason: apiErrorText(e, "form-insights") };
    throw e;
  }

  const costUsd = costOf(model, response.usage);
  const { data: usageRow } = await admin
    .from("ai_usage")
    .insert({
      coach_id: coachId,
      model,
      athletes: work.length,
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cost_usd: costUsd.toFixed(5),
      stop_reason: response.stop_reason,
      trigger: "form",
    })
    .select("id")
    .single();

  if (response.stop_reason === "refusal") return { status: "skipped", reason: "Claude declined this request. Nothing was stored." };
  const parsed = response.parsed_output;
  if (!parsed) return { status: "skipped", reason: `Claude's answer couldn't be read (stop reason: ${response.stop_reason}).` };

  let stored = 0;
  for (const ins of parsed.insights) {
    const athlete = work.find((w) => w.athlete_id === ins.athlete_id);
    const issue = athlete?.issues.find((p) => p.key === ins.issue_key);
    if (!athlete || !issue) continue; // only issues we actually raised
    const picks = ins.picks
      .filter((p) => libIds.has(p.library_id))
      .slice(0, 3)
      .map((p) => ({ library_id: p.library_id, title: libIds.get(p.library_id), reason: p.reason.slice(0, 300) }));
    const { error } = await admin.from("form_insights").insert({
      coach_id: coachId,
      athlete_id: athlete.athlete_id,
      issue_key: issue.key,
      summary: ins.summary.slice(0, 1200),
      evidence: describePattern(issue).slice(0, 2000),
      drills: ins.drills.slice(0, 4).map((d) => d.slice(0, 200)),
      picks,
      usage_id: usageRow?.id ?? null,
    });
    if (!error) stored++;
  }
  return { status: "done", insights: stored, costUsd, model };
}
