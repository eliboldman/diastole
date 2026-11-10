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

const SYSTEM = `You draft a short morning note from an endurance coach to each of their athletes. The coach reviews, edits and sends every note themselves, as a chat message in their own voice.

For each athlete in the input, write 2 to 4 sentences (under 450 characters), first person as the coach, second person to the athlete, using their first name once at most. Cover, as the data allows: how yesterday went (from their workout and check-in), how they look this morning (readiness), and today's plan with its purpose. Be specific, warm and plain-spoken; vary the openings; no greetings like "Good morning!" every time, no sign-off, no emoji, no lists.

Use only facts in the input. Never invent paces, heart rates, dates or workouts. If readiness is yellow or red, acknowledge it calmly and say the coach may adjust today, but don't change the plan yourself. If they flagged pain, acknowledge it and ask how it feels this morning; don't diagnose or give medical advice. If there's no workout today, say it's a rest or easy day only if the input shows no plan. Return one note per athlete_id given.`;

const Output = z.object({
  briefs: z.array(z.object({ athlete_id: z.string(), text: z.string().describe("2-4 sentences, under 450 characters") })),
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
      const [{ data: r }, { data: acts }, { data: plans }, { data: goals }, { data: week }] = await Promise.all([
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
      ]);
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
      draft: b.text.replace(/\s+/g, " ").trim().slice(0, 1200),
      model: response.model ?? model,
    }));
  if (rows.length) {
    await admin.from("morning_briefs").upsert(rows, { onConflict: "coach_id,athlete_id,date", ignoreDuplicates: true });
    await admin.rpc("notify_briefs_ready", { p_coach: coachId, p_count: rows.length, p_date: rows[0].date });
  }
  return { status: "done", drafted: rows.length, costUsd };
}
