import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { AI_MODELS, costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { AiLeaf, AiRepeat } from "@/lib/ai/step-schema";
import { createAdminClient, createClient, type Profile } from "@/lib/supabase/server";
import { cleanWeek, weekForPrompt } from "@/lib/week-prefs";
import { leafToStep } from "@/lib/workouts/ai-steps";
import { validateSteps, type Pool, type Sport, type Step } from "@/lib/workouts/garmin-format";
import { apiErrorText } from "@/lib/ai/api-error";

// "Suggest workouts": Claude drafts up to four weeks for ONE athlete from the coach's guide, that
// athlete's private notes, zones, preferred week, recent training and recovery, races, and the coach's
// guidance for this request. Everything lands as drafts; nothing reaches the athlete until approved.

const DAY = 86_400_000;
const MILE = 1609.344;
const MAX_DAYS = 28;

// ---------------------------------------------------------------- what Claude returns

const Workout = z.object({
  date: z.string().describe("YYYY-MM-DD, within the requested window"),
  sport: z.enum(["run", "bike", "swim"]),
  title: z.string().describe("workout name in the coach's tone, under 60 characters"),
  description: z.string().nullable().describe("top-level message for the athlete, in the coach's tone; one or two sentences"),
  why: z.string().describe("one or two plain sentences for the athlete: what this session is for"),
  pool_length: z.number().nullable().describe("swims only: pool length"),
  pool_unit: z.enum(["yd", "m"]).nullable().describe("swims only"),
  steps: z.array(z.discriminatedUnion("kind", [AiLeaf, AiRepeat])),
});
const PlanOut = z.object({
  summary: z.string().describe("for the coach, 3-5 sentences: period and focus of this block, how the request's guidance and the athlete's data shaped it"),
  weeks: z.array(z.object({ week_start: z.string().describe("YYYY-MM-DD"), focus: z.string(), planned_hours: z.number().nullable() })),
  workouts: z.array(Workout),
  other_days: z.array(z.object({ date: z.string(), kind: z.enum(["rest", "strength", "travel", "race", "note"]), note: z.string() })).describe("strength, rest, travel and race days (not watch workouts)"),
  assumptions: z.string().nullable().describe("anything assumed or missing (e.g. no current FTP), for the coach; null if none"),
});
const FixOut = z.object({ workouts: z.array(Workout) });
type AiWorkout = z.infer<typeof Workout>;

const SYSTEM = `You are the planning assistant for an endurance coach. You draft a block of training for ONE athlete. The coach reviews and approves every workout before the athlete sees it.

How to plan:
- Follow the coach's guide first. Where it names a training framework (periodization, pace systems, key-session rules), apply it.
- Use only this athlete's numbers: their zones and the coach's private notes about them. If a number you need is unknown, or the notes say not to use it (for example an old FTP), don't invent one: use heart-rate zones or effort cues in the step notes, and say so in assumptions.
- Respect the athlete's preferred week (disciplines on which days, time available). If the coach's guidance for this request conflicts with it, the guidance wins.
- Apply the coach's guidance for this request (events, travel, constraints) to volume and intensity around those dates: build into key events, freshen up before them, recover after, keep travel days short or adapted to what's available.
- Races: build toward A races and taper the last 10-14 days before one; treat B races as hard days with a short freshen-up; C races are training.
- Recovery: if recent readiness is yellow or red, or check-ins mention pain or bad sessions, start the block conservatively and say so in the summary.
- Progress volume gradually from the athlete's recent weeks, with a lighter week every third or fourth week, consistent with the guide.
- Plan around workouts already scheduled; don't duplicate them. At most two workouts a day and one per sport.
- Only run, bike and swim sessions become workouts (the watch formats). Strength, rest, travel and race days go in other_days with a short note.

Workout steps:
- Steps: WARMUP, ACTIVE, INTERVAL, RECOVERY, REST, COOLDOWN (MAIN is swim-only). Use a repeat for "N x (...)"; repeats can't be nested; repeat count 2-99. Include warm-ups and cool-downs where the session calls for them.
- Durations: time in seconds, distance with its unit (m, km, yd, mi), or open. Swims: distances in the pool's unit, whole lengths; rest at the wall is a REST step with seconds, or a send-off is a REST step with duration_type sendoff; give pool_length and pool_unit.
- Run targets: pace_range as m:ss in the given pace unit (fast and slow ends), hr_zone 1-5, or hr_range. Bike: power_watts from the athlete's CURRENT FTP only (or power_pct_ftp), or hr. Swim: swim_effort 1-10 or swim_pace_per_100, plus stroke, drill and equipment when useful. Never a pace or power target on a swim, or a swim target on a run or ride.
- Step notes: short and actionable.

Every workout's date must fall inside the requested window.`;

// ---------------------------------------------------------------- context

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => iso(new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const fam = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bike|ride|spin/i.test(s ?? "") ? "bike" : "other");

async function gather(athleteId: string, coachId: string, start: string, end: string, units: "mi" | "km") {
  const supabase = await createClient();
  const today = new Date();
  const since84 = new Date(today.getTime() - 84 * DAY).toISOString();
  const [profile, settings, notes, week, zones, readiness, wellness, acts, checkins, races, planned] = await Promise.all([
    supabase.from("profiles").select("full_name, timezone").eq("id", athleteId).maybeSingle(),
    supabase.from("coach_settings").select("philosophy").eq("coach_id", coachId).maybeSingle(),
    supabase.from("athlete_coaching").select("notes").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_week").select("days").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w, threshold_hr").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("readiness_scores").select("date, overall, note").eq("athlete_id", athleteId).order("date", { ascending: false }).limit(14),
    supabase.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds").eq("athlete_id", athleteId).gte("date", iso(new Date(today.getTime() - 28 * DAY))),
    supabase.from("activities").select("sport, name, start_time, duration_s, distance_m, avg_hr, avg_power").eq("athlete_id", athleteId).gte("start_time", since84).order("start_time").limit(600),
    supabase.from("workout_checkins").select("created_at, feel, rpe, pain, note").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(10),
    supabase.from("races").select("name, race_date, sport, distance_km, goal_seconds, priority, notes").eq("athlete_id", athleteId).gte("race_date", iso(today)).order("race_date").limit(10),
    supabase.from("planned_workouts").select("scheduled_date, title, sport, status, plan_batch").eq("athlete_id", athleteId).is("deleted_at", null).gte("scheduled_date", addDays(start, -7)).lte("scheduled_date", end).order("scheduled_date"),
  ]);

  const per = units === "mi" ? MILE : 1000;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const z = zones.data;
  const real = (acts.data ?? []).filter((a) => (a.duration_s ?? 0) >= 300);

  // Last 12 weeks, week by week: hours per sport, sessions, longest session.
  const weeks = new Map<string, { hours: Record<string, number>; sessions: number; longest_min: number }>();
  for (const a of real) {
    const d = new Date(a.start_time);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const k = iso(d);
    const w = weeks.get(k) ?? { hours: {}, sessions: 0, longest_min: 0 };
    const f = fam(a.sport);
    w.hours[f] = Math.round(((w.hours[f] ?? 0) + (a.duration_s ?? 0) / 3600) * 10) / 10;
    w.sessions += 1;
    w.longest_min = Math.max(w.longest_min, Math.round((a.duration_s ?? 0) / 60));
    weeks.set(k, w);
  }
  const fortnight = Date.now() - 14 * DAY;
  const wl = wellness.data ?? [];
  const recent = wl.filter((w) => Date.parse(w.date) >= Date.now() - 7 * DAY);

  return {
    name: (profile.data?.full_name ?? "").split(" ")[0] || "the athlete",
    philosophy: settings.data?.philosophy?.trim() || null,
    context: {
      today: iso(today),
      window: { start, end, days: Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1, first_weekday: new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) },
      pace_unit: units,
      coach_notes_about_this_athlete: notes.data?.notes?.trim() || null,
      preferred_week: weekForPrompt(cleanWeek(week.data?.days)),
      zones: {
        ftp_watts: z?.ftp_w ?? null,
        threshold_pace: z?.threshold_speed_mps ? `${clock(per / Number(z.threshold_speed_mps))} per ${units}` : null,
        max_hr: z?.max_hr ?? null,
        threshold_hr: z?.threshold_hr ?? null,
      },
      races: (races.data ?? []).map((r) => ({
        name: r.name,
        date: r.race_date,
        days_out: Math.round((Date.parse(r.race_date) - Date.parse(iso(today))) / DAY),
        sport: r.sport,
        distance_km: r.distance_km,
        goal: r.goal_seconds ? clock(r.goal_seconds / 60) + " h:mm" : null,
        priority: r.priority,
        notes: r.notes,
      })),
      readiness_last_14_days: (readiness.data ?? []).map((r) => `${r.date}: ${r.overall}`),
      recovery_trend: {
        hrv_7d: avg(recent.map((w) => Number(w.hrv_ms)).filter((n) => n > 0)),
        hrv_28d: avg(wl.map((w) => Number(w.hrv_ms)).filter((n) => n > 0)),
        resting_hr_7d: avg(recent.map((w) => Number(w.resting_hr)).filter((n) => n > 0)),
        resting_hr_28d: avg(wl.map((w) => Number(w.resting_hr)).filter((n) => n > 0)),
        sleep_hours_7d: avg(recent.map((w) => Number(w.sleep_seconds) / 3600).filter((n) => n > 0)),
      },
      training_by_week: [...weeks.entries()].map(([week_start, w]) => ({ week_start, ...w })),
      last_14_days: real
        .filter((a) => Date.parse(a.start_time) >= fortnight)
        .map((a) => ({ date: a.start_time.slice(0, 10), sport: a.sport, name: a.name, minutes: Math.round((a.duration_s ?? 0) / 60), km: a.distance_m ? Math.round(Number(a.distance_m) / 100) / 10 : null, avg_hr: a.avg_hr, avg_power: a.avg_power })),
      recent_checkins: (checkins.data ?? []).map((c) => ({ date: c.created_at.slice(0, 10), feel_1_to_5: c.feel, rpe: c.rpe, pain: c.pain && Object.keys(c.pain as object).length ? c.pain : null, note: c.note })),
      already_scheduled: (planned.data ?? []).filter((p) => !p.plan_batch || p.status !== "draft").map((p) => ({ date: p.scheduled_date, sport: p.sport, title: p.title, status: p.status })),
    },
  };
}

// ---------------------------------------------------------------- the run

export type PlanResult =
  | { ok: true; batchId: string; created: number; dropped: string[]; costUsd: number }
  | { ok: false; error: string };

export async function suggestPlan(me: Profile, input: { athleteId: string; start: string; days: number; guidance: string; replaceDrafts: boolean }): Promise<PlanResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is configured." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start)) return { ok: false, error: "Pick a start date." };
  const days = Math.max(1, Math.min(MAX_DAYS, Math.round(input.days)));
  const end = addDays(input.start, days - 1);
  const guidance = input.guidance.replace(/\s+/g, " ").trim().slice(0, 2000);

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: athlete } = await supabase.from("profiles").select("id, coach_id").eq("id", input.athleteId).maybeSingle();
  if (!athlete || (athlete.id !== me.id && athlete.coach_id !== me.id)) return { ok: false, error: "That athlete isn't yours." };

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Me → Coaching assistant." };
  if ((await monthToDateSpend(me.id)) >= Number(settings.ai_monthly_cap_usd) - 0.05) return { ok: false, error: "Monthly AI cap reached. Raise it in Me → Coaching assistant." };
  const model = settings.ai_model as AiModel;

  const g = await gather(input.athleteId, me.id, input.start, end, me.units);
  if (!g.philosophy) return { ok: false, error: "Add your coaching guide first (Me → Coaching assistant)." };

  const client = new Anthropic();
  let total = 0;
  const log = async (m: Anthropic.Beta.BetaMessage) => {
    const cost = costOf(model, m.usage);
    total += cost;
    await admin.from("ai_usage").insert({
      coach_id: me.id,
      model,
      athletes: 1,
      input_tokens: m.usage.input_tokens ?? 0,
      output_tokens: m.usage.output_tokens ?? 0,
      cache_read_tokens: m.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: m.usage.cache_creation_input_tokens ?? 0,
      cost_usd: cost.toFixed(5),
      stop_reason: m.stop_reason,
      trigger: "plan",
    });
  };

  // Long output: stream, then validate the JSON against the schema ourselves.
  async function ask<T extends z.ZodTypeAny>(schema: T, user: string, effort: "low" | "medium"): Promise<z.infer<T> | null> {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 32000,
      system: [
        { type: "text", text: SYSTEM },
        { type: "text", text: `The coach's guide:\n\n${g.philosophy}`, cache_control: { type: "ephemeral" } },
      ],
      output_config: { effort, format: betaZodOutputFormat(schema) },
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      messages: [{ role: "user", content: user }],
    });
    const msg = await stream.finalMessage();
    await log(msg);
    if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return null;
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      const parsed = schema.safeParse(JSON.parse(text));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  const ctx = (w: AiWorkout) => {
    const pool: Pool = w.sport === "swim" && w.pool_length && w.pool_length > 0 ? { length: w.pool_length, unit: w.pool_unit === "m" ? "METER" : "YARD" } : null;
    return { paceUnit: me.units, ftp: g.context.zones.ftp_watts, pool };
  };
  const convert = (w: AiWorkout) => {
    const c = ctx(w);
    const steps: Step[] = w.steps.map((x) => (x.kind === "repeat" ? { kind: "repeat", times: x.times, steps: x.steps.map((l) => leafToStep(l, c)) } : leafToStep(x, c)));
    const errors = validateSteps(steps, 0, w.sport as Sport, c.pool);
    if (w.date < input.start || w.date > end) errors.push(`date ${w.date} is outside ${input.start} to ${end}`);
    return { w, steps, pool: c.pool, errors };
  };

  try {
    const request = `Athlete: ${g.name}.\n\nContext (JSON):\n${JSON.stringify(g.context)}\n\nPlan ${days === 1 ? `one day, ${input.start}` : `${days} days, ${input.start} to ${end}`}.${guidance ? `\n\nThe coach's guidance for this block:\n${guidance}` : ""}`;
    const plan = await ask(PlanOut, request, "medium");
    if (!plan) return { ok: false, error: "Claude couldn't put that block together. Try again, or shorten the window." };

    let results = plan.workouts.map(convert);
    const bad = results.filter((r) => r.errors.length);
    if (bad.length) {
      const fix = await ask(
        FixOut,
        `${request}\n\nThese drafted workouts failed the watch's checks. Return corrected versions of ONLY these workouts (same dates and intent):\n${JSON.stringify(bad.map((b) => ({ workout: b.w, errors: b.errors })))}`,
        "low",
      );
      const fixed = (fix?.workouts ?? []).map(convert).filter((r) => !r.errors.length);
      results = [...results.filter((r) => !r.errors.length), ...fixed];
    }
    const good = results.filter((r) => !r.errors.length).sort((a, b) => a.w.date.localeCompare(b.w.date));
    const dropped = plan.workouts.filter((w) => !good.some((r) => r.w.date === w.date && r.w.sport === w.sport)).map((w) => `${w.date} ${w.title}`);
    if (!good.length) return { ok: false, error: "None of the drafted workouts passed the watch's checks. Try again." };

    if (input.replaceDrafts) {
      // Earlier suggestions in this window that were never approved.
      await supabase.from("planned_workouts").delete().eq("athlete_id", input.athleteId).eq("status", "draft").not("plan_batch", "is", null).gte("scheduled_date", input.start).lte("scheduled_date", end);
    }
    const { data: batch, error: bErr } = await supabase
      .from("plan_batches")
      .insert({
        athlete_id: input.athleteId,
        start_date: input.start,
        days,
        guidance: guidance || null,
        summary: { summary: plan.summary, weeks: plan.weeks, other_days: plan.other_days, assumptions: plan.assumptions, dropped, cost_usd: Math.round(total * 1000) / 1000 },
      })
      .select("id")
      .single();
    if (bErr || !batch) return { ok: false, error: "Couldn't save the suggestions." };
    const { error: wErr } = await supabase.from("planned_workouts").insert(
      good.map((r) => ({
        athlete_id: input.athleteId,
        coach_id: me.id,
        scheduled_date: r.w.date,
        sport: r.w.sport,
        title: r.w.title.trim().slice(0, 100) || "Workout",
        description: r.w.description?.trim().slice(0, 1024) || null,
        why: r.w.why.trim().slice(0, 600) || null,
        steps: r.steps,
        status: "draft",
        pool_length: r.pool?.length ?? null,
        pool_unit: r.pool?.unit ?? null,
        plan_batch: batch.id,
      })),
    );
    if (wErr) return { ok: false, error: `Couldn't save the workouts: ${wErr.message}` };
    return { ok: true, batchId: batch.id, created: good.length, dropped, costUsd: total };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is busy right now. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "plan") };
    throw e;
  }
}
