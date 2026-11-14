import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { AI_MODELS, costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { sportLabel } from "@/lib/activity/format";
import { normalizePain, SPOTS, spotLabel, PAIN_LABEL, FEEL, type PainLevel } from "@/lib/avatar/pain";
import { createAdminClient } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";
import { apiErrorText } from "@/lib/ai/api-error";

const SYSTEM = `You draft a short morning note from an endurance coach to each of their athletes. The coach reviews, edits and sends every note themselves, as a chat message in their own voice. Nothing you write is sent without that review.

FIRST read the numbers, THEN decide how much to say. For each athlete, look at readiness, recovery (resting HR, HRV and sleep against their own 4-week normal, Body Battery) and the rest of the week before you look at how long their check-in note is. The physiology outranks the length of the comment. Then pick a tier:
- Tier 1, a plain log (session done, nothing said, numbers normal): one short line. Acknowledge it and name today. Under 140 characters.
- Tier 2, they shared a feeling ("legs were heavy", "felt great"): one or two sentences that answer the feeling.
- Tier 3, they made a decision on the fly (cut a session short, swapped days, held back): affirm the decision itself, and say what it protects or buys later in the week.
- Tier 4, something underneath (pain, a run of red days, recovery numbers well off normal, stress or a life change in their note): two to four sentences, calm, and suggest a quick call with the coach. Don't diagnose.
Match the reply to what the athlete gave you: a short log gets a short reply.

Voice: coach and friend. Respond to what they decided and did, not a readout of the data. When today is easy or a lighter day, name when the payoff comes ("so Thursday's run lands") and frame the discipline as buying something later. One red day is not a verdict: say to start the warm-up and see how the first 20 minutes feel, unless the coach's plan already changed it. First person as the coach, second person to the athlete, first name once at most. Specific, warm and plain-spoken; vary the openings; no "Good morning!" every time, no sign-off, no emoji, no lists, no em dashes.

Use only facts in the input. Never invent paces, heart rates, dates or workouts. If you infer something the data doesn't state outright (for example that they're tired), phrase it as a question or a read, not a fact. If readiness is yellow or red, acknowledge it calmly and say the coach may adjust today, but don't change the plan yourself. If they flagged pain, acknowledge it and ask how it feels this morning; don't diagnose or give medical advice. If there's no workout today, say it's a rest or easy day only if the input shows no plan. Return one note per athlete_id given.`;

const Output = z.object({
  briefs: z.array(z.object({ athlete_id: z.string(), tier: z.number().int().min(1).max(4).describe("Reply tier chosen after reading the numbers"), text: z.string().describe("Tier 1: one line under 140 characters; tiers 2-4: up to 4 sentences, under 450 characters") })),
});

export type BriefRun = { status: "done"; drafted: number; costUsd: number } | { status: "skipped"; reason: string };

const localDate = (tz: string, offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(Date.now() + offsetDays * 86_400_000));

/**
 * Who has last night's data in: a wellness row for their today with sleep, HRV or resting HR.
 * The morning review waits for this, since athletes wake and sync at different times.
 */
export async function overnightIn(admin: ReturnType<typeof createAdminClient>, athletes: { id: string; timezone: string | null }[]): Promise<Set<string>> {
  if (!athletes.length) return new Set();
  const { data } = await admin
    .from("daily_wellness")
    .select("athlete_id, date, hrv_ms, sleep_seconds, resting_hr")
    .in("athlete_id", athletes.map((a) => a.id))
    .gte("date", localDate("Pacific/Kiritimati", -2));
  const ready = new Set<string>();
  for (const a of athletes) {
    const today = localDate(a.timezone || "America/Chicago");
    if ((data ?? []).some((w) => w.athlete_id === a.id && w.date === today && (w.hrv_ms || w.sleep_seconds || w.resting_hr))) ready.add(a.id);
  }
  return ready;
}

/**
 * Draft today's briefs for a coach's athletes that don't have one yet. Coach-only drafts; nothing
 * is sent. `onlyReady`: skip athletes whose overnight data hasn't arrived yet (run again later).
 */
export async function draftMorningBriefs(coachId: string, opts: { onlyReady?: boolean } = {}): Promise<BriefRun> {
  if (!process.env.ANTHROPIC_API_KEY) return { status: "skipped", reason: "No Anthropic API key configured." };
  const admin = createAdminClient();
  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coachId).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  const model = settings.ai_model as AiModel;
  if (!settings.ai_enabled) return { status: "skipped", reason: "The coaching assistant is turned off." };
  const spent = await monthToDateSpend(coachId);
  if (spent >= Number(settings.ai_monthly_cap_usd) - 0.02) return { status: "skipped", reason: "Monthly AI cap reached." };

  const { data: roster } = await admin
    .from("profiles")
    .select("id, full_name, timezone, units")
    .eq("coach_id", coachId)
    .neq("id", coachId) // a coach doesn't brief themself
    .eq("is_test", false);
  if (!roster?.length) return { status: "skipped", reason: "No athletes yet." };

  const { data: existing } = await admin.from("morning_briefs").select("athlete_id, date").eq("coach_id", coachId).gte("date", localDate("Pacific/Kiritimati", -2));
  const have = new Set((existing ?? []).map((b) => `${b.athlete_id}|${b.date}`));
  let due = roster.filter((a) => !have.has(`${a.id}|${localDate(a.timezone)}`));
  if (!due.length) return { status: "skipped", reason: "Today's briefs are already drafted." };
  if (opts.onlyReady) {
    const ready = await overnightIn(admin, due);
    due = due.filter((a) => ready.has(a.id));
    if (!due.length) return { status: "skipped", reason: "No one new has synced last night's data yet." };
  }

  const payload = await Promise.all(
    due.map(async (a) => {
      const today = localDate(a.timezone);
      const yesterday = localDate(a.timezone, -1);
      const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [{ data: r }, { data: acts }, { data: plans }, { data: goals }, { data: week }, { data: well }, { data: weekPlan }] = await Promise.all([
        admin.from("readiness_scores").select("date, overall, note").eq("athlete_id", a.id).order("date", { ascending: false }).limit(1).maybeSingle(),
        admin
          .from("activities")
          .select("id, sport, name, start_time, duration_s, distance_m, avg_hr, workout_checkins(feel, rpe, pain, note), activity_strain(auto, custom)")
          .eq("athlete_id", a.id)
          .gte("start_time", since)
          .order("start_time"),
        admin
          .from("planned_workouts")
          .select("title, sport, steps, why, pool_length, pool_unit")
          .eq("athlete_id", a.id)
          .eq("scheduled_date", today)
          .neq("status", "draft")
          .is("deleted_at", null),
        admin.from("athlete_goals").select("race_name, race_date, block_name").eq("athlete_id", a.id).maybeSingle(),
        admin.from("activities").select("duration_s").eq("athlete_id", a.id).gte("start_time", weekAgo),
        admin.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds, body_battery_high").eq("athlete_id", a.id).gte("date", localDate(a.timezone, -28)),
        admin.from("planned_workouts").select("scheduled_date, title").eq("athlete_id", a.id).gt("scheduled_date", today).lte("scheduled_date", localDate(a.timezone, 6)).neq("status", "draft").is("deleted_at", null).order("scheduled_date"),
      ]);
      const mean = (col: "hrv_ms" | "resting_hr" | "sleep_seconds", rows: typeof well) => {
        const v = (rows ?? []).map((w) => Number(w[col])).filter((x) => x > 0);
        return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null;
      };
      const last = (well ?? []).filter((w) => w.date === today);
      const recentReds = await admin.from("readiness_scores").select("overall").eq("athlete_id", a.id).gte("date", localDate(a.timezone, -2));
      const unit = a.units === "km" ? "km" : "mi";
      return {
        athlete_id: a.id,
        first_name: (a.full_name ?? "").split(" ")[0] || null,
        today,
        readiness: r && r.date >= yesterday ? { flag: r.overall, note: r.note } : null,
        recent_workouts: (acts ?? []).map((x) => {
          const c = (Array.isArray(x.workout_checkins) ? x.workout_checkins[0] : x.workout_checkins) as
            | { feel: number | null; rpe: number | null; pain: unknown; note: string | null }
            | null
            | undefined;
          const pain = normalizePain(c?.pain);
          return {
            sport: sportLabel(x.sport),
            name: x.name,
            minutes: x.duration_s ? Math.round(x.duration_s / 60) : null,
            km: x.distance_m ? Math.round(x.distance_m / 100) / 10 : null,
            avg_hr: x.avg_hr,
            checkin: c
              ? {
                  felt: FEEL.find((f) => f.v === c.feel)?.label ?? null,
                  rpe: c.rpe,
                  pain: SPOTS.filter((sp) => pain[sp]).map((sp) => `${spotLabel(sp)} (${PAIN_LABEL[pain[sp] as PainLevel].toLowerCase()})`),
                  note: c.note,
                }
              : null,
          };
        }),
        today_plan: (plans ?? []).map((p) => {
          const pool: Pool = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
          return { title: p.title, sport: sportLabel(p.sport), steps: describe((p.steps ?? []) as Step[], unit, pool, p.sport === "swim"), why: p.why };
        }),
        goal: goals?.race_name ? { race: goals.race_name, date: goals.race_date, block: goals.block_name } : goals?.block_name ? { block: goals.block_name } : null,
        recovery: {
          resting_hr_today: mean("resting_hr", last),
          resting_hr_4wk: mean("resting_hr", well) && Math.round(mean("resting_hr", well)!),
          hrv_today: mean("hrv_ms", last),
          hrv_4wk: mean("hrv_ms", well) && Math.round(mean("hrv_ms", well)!),
          sleep_hours_today: mean("sleep_seconds", last) && Math.round(mean("sleep_seconds", last)! / 360) / 10,
          sleep_hours_4wk: mean("sleep_seconds", well) && Math.round(mean("sleep_seconds", well)! / 360) / 10,
          body_battery_today: last[0]?.body_battery_high ?? null,
          red_days_last_3: (recentReds.data ?? []).filter((x) => x.overall === "red").length,
        },
        rest_of_week: (weekPlan ?? []).map((p) => `${p.scheduled_date} ${p.title}`),
        last_7_days_hours: Math.round(((week ?? []).reduce((t, x) => t + (x.duration_s ?? 0), 0) / 3600) * 10) / 10,
      };
    }),
  );

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [{ role: "user", content: `Athletes this morning (JSON):\n\n${JSON.stringify(payload)}` }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { status: "skipped", reason: "Claude API rate limit. Try again shortly." };
    if (e instanceof Anthropic.AuthenticationError) return { status: "skipped", reason: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { status: "skipped", reason: apiErrorText(e, "briefs") };
    throw e;
  }

  const costUsd = costOf(model, response.usage);
  await admin.from("ai_usage").insert({
    coach_id: coachId,
    model,
    athletes: due.length,
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cost_usd: costUsd.toFixed(5),
    stop_reason: response.stop_reason,
    trigger: "brief",
  });
  if (response.stop_reason === "refusal") return { status: "skipped", reason: "Claude declined. Nothing was drafted." };
  const parsed = response.parsed_output;
  if (!parsed) return { status: "skipped", reason: `The drafts couldn't be read (stop reason: ${response.stop_reason}).` };

  const byId = new Map(due.map((a) => [a.id, a]));
  const rows = parsed.briefs
    .filter((b) => byId.has(b.athlete_id) && b.text.trim())
    .map((b) => ({
      coach_id: coachId,
      athlete_id: b.athlete_id,
      date: localDate(byId.get(b.athlete_id)!.timezone),
      draft: b.text.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, 1200), // no em dashes in anything athlete-facing
      model: response.model ?? model,
    }));
  if (rows.length) {
    await admin.from("morning_briefs").upsert(rows, { onConflict: "coach_id,athlete_id,date", ignoreDuplicates: true });
    await admin.rpc("notify_briefs_ready", { p_coach: coachId, p_count: rows.length, p_date: rows[0].date });
  }
  return { status: "done", drafted: rows.length, costUsd };
}
