import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { apiErrorText } from "@/lib/ai/api-error";
import { AI_MODELS, costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { complianceText } from "@/lib/activity/compare";
import { createAdminClient } from "@/lib/supabase/server";
import { getLoad } from "@/lib/training/load-data";
import { mondayOf } from "@/lib/training/week";
import { getWeek } from "@/lib/training/week-data";

// Ask Diastole: the coach asks about their own athletes in plain words; Claude looks things up with
// read-only tools that run as the coach (row-level security limits them to the coach's athletes).

export type AskTurn = { role: "user" | "assistant"; text: string };
export type AskResult = { ok: true; text: string; costUsd: number } | { ok: false; error: string };

const MAX_HISTORY = 12; // earlier turns sent back for follow-ups
const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const round = (v: unknown, places = 1) => (typeof v === "number" || (typeof v === "string" && v !== "") ? Math.round(Number(v) * 10 ** places) / 10 ** places : null);

const SYSTEM = `You are Ask Diastole, an analyst inside Diastole, a coaching app for a small group of college endurance athletes. The person asking is their coach. Answer questions about the coach's athletes using the tools, which read the app's real data.

- Look things up before answering; never guess numbers. Call several tools at once when the question spans athletes or kinds of data. If the data isn't there, say so plainly.
- Be concise and specific: lead with the answer, then the few numbers that support it (dates, paces, watts, HRV, sleep). Compare to the athlete's own baseline when it helps.
- Units: the coach uses {UNITS}. Paces as m:ss per {UNIT}, distances in {UNIT_LONG}, swims in yards.
- Link people and sessions so the coach can open them: athletes as [Name](/athlete/ATHLETE_ID), activities as [short label](/activity/ACTIVITY_ID), planned workouts as [title](/athlete/ATHLETE_ID/workouts/WORKOUT_ID). Only link to ids that came from the tools.
- Format: short paragraphs, bullet lists, and small markdown tables when comparing several athletes or weeks. No headings larger than bold text.
- You inform the coach; you don't change plans or message athletes. Training guidance only, not medical advice; if something looks like an injury or illness, suggest checking in with the athlete or an athletic trainer.
- Today is {TODAY}.`;

function tools(supabase: SupabaseClient, coachId: string, onStep: (label: string) => void, names: Map<string, string>) {
  const who = (id: string) => names.get(id) ?? "athlete";
  const checkId = (id: string) => {
    if (!names.has(id)) throw new Error("Unknown athlete id. Call list_athletes for valid ids.");
  };

  const listAthletes = betaZodTool({
    name: "list_athletes",
    description: "The coach's athletes (and the coach, who trains too): id, name, watch, training zones, and today's readiness flag. Call this first to get ids.",
    inputSchema: z.object({}),
    run: async () => {
      onStep("Looking at your roster");
      const ids = [...names.keys()];
      const today = isoDay(new Date());
      const [{ data: zones }, { data: devices }, { data: ready }] = await Promise.all([
        supabase.from("athlete_zones").select("athlete_id, ftp_w, threshold_speed_mps, threshold_hr, max_hr").in("athlete_id", ids),
        supabase.from("device_connections").select("athlete_id, source, last_synced_at").in("athlete_id", ids),
        supabase.from("readiness_scores").select("athlete_id, date, overall, note").in("athlete_id", ids).gte("date", isoDay(new Date(Date.now() - 2 * DAY))),
      ]);
      return JSON.stringify(
        ids.map((id) => {
          const z = zones?.find((x) => x.athlete_id === id);
          const d = devices?.find((x) => x.athlete_id === id);
          const r = (ready ?? []).filter((x) => x.athlete_id === id).sort((a, b) => b.date.localeCompare(a.date))[0];
          return {
            id,
            name: names.get(id),
            is_coach: id === coachId,
            watch: d ? { source: d.source, last_synced: d.last_synced_at } : null,
            zones: z ? { ftp_w: z.ftp_w, threshold_speed_mps: z.threshold_speed_mps, threshold_hr: z.threshold_hr, max_hr: z.max_hr } : null,
            readiness_today: r ? { date: r.date, flag: r.overall, note: r.note, is_today: r.date === today } : null,
          };
        }),
      );
    },
  });

  const dailyTrends = betaZodTool({
    name: "daily_trends",
    description:
      "One athlete's daily recovery data for the last N days (max 180): HRV (ms), resting HR, sleep hours, sleep score, stress, readiness flag; plus training load now (fitness = 42-day load, fatigue = 7-day, form = fitness minus fatigue; 1 hour at threshold = 100).",
    inputSchema: z.object({ athlete_id: z.string(), days: z.number().int().min(1).max(180) }),
    run: async ({ athlete_id, days }) => {
      checkId(athlete_id);
      onStep(`Reading ${who(athlete_id)}'s recovery data`);
      const since = isoDay(new Date(Date.now() - days * DAY));
      const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", athlete_id).maybeSingle();
      const [{ data: well }, { data: ready }, load] = await Promise.all([
        supabase.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds, sleep_score, stress_avg, body_battery_high").eq("athlete_id", athlete_id).gte("date", since).order("date"),
        supabase.from("readiness_scores").select("date, overall").eq("athlete_id", athlete_id).gte("date", since),
        getLoad(supabase, athlete_id, prof?.timezone || "America/Chicago").catch(() => null),
      ]);
      const flag = new Map((ready ?? []).map((r) => [r.date, r.overall]));
      return JSON.stringify({
        days: (well ?? []).map((w) => ({
          date: w.date,
          hrv_ms: round(w.hrv_ms),
          resting_hr: round(w.resting_hr, 0),
          sleep_h: w.sleep_seconds ? round(w.sleep_seconds / 3600) : null,
          sleep_score: w.sleep_score,
          stress: w.stress_avg,
          body_battery_high: w.body_battery_high,
          readiness: flag.get(w.date) ?? null,
        })),
        training_load_now: load ? { fitness: Math.round(load.now.fitness), fatigue: Math.round(load.now.fatigue), form: load.now.form, meaning: load.now.band.label, fitness_change_7d: load.now.ramp } : null,
      });
    },
  });

  const activities = betaZodTool({
    name: "activities",
    description:
      "One athlete's completed workouts between two dates (YYYY-MM-DD, inclusive; max 200 rows), newest first: id, date, sport, name, minutes, distance (m), avg/max HR, avg and normalized power, avg pace, the planned workout it fulfilled, and best efforts inside it (fastest mile/5K/10K/half in seconds, best 20-min power).",
    inputSchema: z.object({ athlete_id: z.string(), from: z.string(), to: z.string(), sport: z.enum(["run", "bike", "swim", "other"]).nullable().optional() }),
    run: async ({ athlete_id, from, to, sport }) => {
      checkId(athlete_id);
      onStep(`Going through ${who(athlete_id)}'s workouts`);
      const { data } = await supabase
        .from("activities")
        .select("id, start_time, sport, name, duration_s, distance_m, avg_hr, max_hr, avg_power, normalized_power, avg_speed_mps, planned_workout_id, activity_details(bests)")
        .eq("athlete_id", athlete_id)
        .gte("start_time", `${from}T00:00:00Z`)
        .lte("start_time", `${to}T23:59:59Z`)
        .order("start_time", { ascending: false })
        .limit(200);
      const fam = (s: string | null) => (/swim/i.test(s ?? "") ? "swim" : /run|treadmill|track|trail/i.test(s ?? "") ? "run" : /cycl|bik|ride|spin/i.test(s ?? "") ? "bike" : "other");
      return JSON.stringify(
        (data ?? [])
          .filter((a) => !sport || fam(a.sport) === sport)
          .map((a) => {
            const det = (Array.isArray(a.activity_details) ? a.activity_details[0] : a.activity_details) as { bests?: unknown } | null;
            return {
              id: a.id,
              date: a.start_time.slice(0, 10),
              sport: a.sport,
              name: a.name,
              minutes: a.duration_s ? Math.round(a.duration_s / 60) : null,
              distance_m: round(a.distance_m, 0),
              avg_hr: round(a.avg_hr, 0),
              max_hr: round(a.max_hr, 0),
              avg_power: round(a.avg_power, 0),
              normalized_power: round(a.normalized_power, 0),
              avg_speed_mps: round(a.avg_speed_mps, 2),
              planned_workout_id: a.planned_workout_id,
              bests: det?.bests ?? null,
            };
          }),
      );
    },
  });

  const week = betaZodTool({
    name: "planned_vs_done",
    description:
      "One athlete's week (Monday to Sunday containing the given date): each planned session with status (done, short = under 70% of planned time, missed, today, upcoming), time done vs planned, the matched activity id, and how many steps were on target; per-sport planned vs done totals; extra unplanned sessions.",
    inputSchema: z.object({ athlete_id: z.string(), date: z.string().describe("Any date in the week, YYYY-MM-DD") }),
    run: async ({ athlete_id, date }) => {
      checkId(athlete_id);
      onStep(`Checking ${who(athlete_id)}'s plan for that week`);
      const { data: prof } = await supabase.from("profiles").select("timezone").eq("id", athlete_id).maybeSingle();
      const w = await getWeek(supabase, athlete_id, prof?.timezone || "America/Chicago", mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : isoDay(new Date())));
      return JSON.stringify({
        week: `${w.start} to ${w.end}`,
        done_of_due: `${w.done} of ${w.due}`,
        sessions: w.sessions.map((s) => ({
          date: s.plan.date,
          workout_id: s.plan.id,
          title: s.plan.title,
          sport: s.plan.sport,
          status: s.status,
          planned_min: Math.round(s.plannedSec / 60),
          done_min: s.activity?.duration_s ? Math.round((s.activity.duration_s + (s.brickRun?.duration_s ?? 0)) / 60) : null,
          activity_id: s.activity?.id ?? null,
          on_target: complianceText(w.compliance[s.plan.id] ?? null),
        })),
        by_sport: w.sports.map((s) => ({ sport: s.family, planned_min: Math.round(s.plannedSec / 60), done_min: Math.round(s.doneSec / 60), planned_m: Math.round(s.plannedM), done_m: Math.round(s.doneM) })),
        extras: w.extras.map((a) => ({ id: a.id, date: a.start_time.slice(0, 10), sport: a.sport, minutes: a.duration_s ? Math.round(a.duration_s / 60) : null })),
      });
    },
  });

  const checkins = betaZodTool({
    name: "checkins",
    description: "One athlete's post-workout check-ins for the last N days (max 120): feel (1 awful to 5 great), RPE 1-10, pain spots with level, note, and the activity it was about.",
    inputSchema: z.object({ athlete_id: z.string(), days: z.number().int().min(1).max(120) }),
    run: async ({ athlete_id, days }) => {
      checkId(athlete_id);
      onStep(`Reading ${who(athlete_id)}'s check-ins`);
      const { data } = await supabase
        .from("workout_checkins")
        .select("created_at, activity_id, feel, rpe, pain, note")
        .eq("athlete_id", athlete_id)
        .gte("created_at", new Date(Date.now() - days * DAY).toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      return JSON.stringify((data ?? []).map((c) => ({ date: c.created_at.slice(0, 10), activity_id: c.activity_id, feel: c.feel, rpe: c.rpe, pain: c.pain, note: c.note })));
    },
  });

  const goals = betaZodTool({
    name: "races_and_goals",
    description: "One athlete's upcoming and recent races (date, distance, goal time, priority A/B/C) and their current goal or training block.",
    inputSchema: z.object({ athlete_id: z.string() }),
    run: async ({ athlete_id }) => {
      checkId(athlete_id);
      onStep(`Looking at ${who(athlete_id)}'s races`);
      const [{ data: races }, { data: goal }] = await Promise.all([
        supabase.from("races").select("name, race_date, sport, distance_km, goal_seconds, priority, notes").eq("athlete_id", athlete_id).gte("race_date", isoDay(new Date(Date.now() - 60 * DAY))).order("race_date").limit(20),
        supabase.from("athlete_goals").select("race_name, race_date, block_name").eq("athlete_id", athlete_id).maybeSingle(),
      ]);
      return JSON.stringify({ races: races ?? [], goal: goal ?? null });
    },
  });

  return [listAthletes, dailyTrends, activities, week, checkins, goals];
}

/** Answer one question (with the conversation so far). `onStep` reports what's being looked at. */
export async function askDiastole(opts: {
  supabase: SupabaseClient;
  coach: { id: string; units: string | null };
  history: AskTurn[];
  question: string;
  onStep: (label: string) => void;
}): Promise<AskResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is set up." };
  const { supabase, coach } = opts;
  const admin = createAdminClient();
  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coach.id).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Settings." };
  const model = (settings.ai_model in AI_MODELS ? settings.ai_model : DEFAULT_SETTINGS.ai_model) as AiModel;
  const spent = await monthToDateSpend(coach.id);
  if (spent >= Number(settings.ai_monthly_cap_usd) - 0.02) return { ok: false, error: `Monthly AI cap reached ($${spent.toFixed(2)} of $${Number(settings.ai_monthly_cap_usd).toFixed(2)}).` };

  const { data: people } = await supabase.from("profiles").select("id, full_name, email").or(`coach_id.eq.${coach.id},id.eq.${coach.id}`).eq("is_test", false);
  const names = new Map((people ?? []).map((p) => [p.id as string, ((p.full_name || p.email || "Athlete") as string).trim()]));

  const km = coach.units === "km";
  const system = SYSTEM.replace("{UNITS}", km ? "metric" : "miles")
    .replaceAll("{UNIT}", km ? "km" : "mi")
    .replace("{UNIT_LONG}", km ? "kilometres" : "miles")
    .replace("{TODAY}", new Date().toISOString().slice(0, 10));

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...opts.history.slice(-MAX_HISTORY).map((t) => ({ role: t.role, content: t.text.slice(0, 8000) })),
    { role: "user" as const, content: opts.question.slice(0, 2000) },
  ];

  const client = new Anthropic();
  let costUsd = 0;
  let last: Anthropic.Beta.BetaMessage | null = null;
  try {
    const runner = client.beta.messages.toolRunner({
      model,
      max_tokens: 8000,
      max_iterations: 8,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: tools(supabase, coach.id, opts.onStep, names),
      messages,
      output_config: { effort: "medium" },
      ...(AI_MODELS[model].fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    for await (const message of runner) {
      last = message;
      costUsd += costOf(model, message.usage);
    }
  } catch (e) {
    if (costUsd) await logUsage(admin, coach.id, model, costUsd, last, names.size);
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "ask") };
    console.error("ask failed", e);
    return { ok: false, error: "Something went wrong looking that up. Try again." };
  }
  await logUsage(admin, coach.id, model, costUsd, last, names.size);
  if (!last) return { ok: false, error: "No answer came back. Try again." };
  if (last.stop_reason === "refusal") return { ok: false, error: "Claude declined to answer that one." };
  const text = last.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
  if (!text) return { ok: false, error: last.stop_reason === "max_tokens" ? "The answer ran long and was cut off. Try a narrower question." : "No answer came back. Try rephrasing." };
  return { ok: true, text, costUsd };
}

async function logUsage(admin: ReturnType<typeof createAdminClient>, coachId: string, model: AiModel, costUsd: number, last: Anthropic.Beta.BetaMessage | null, athletes: number) {
  await admin.from("ai_usage").insert({
    coach_id: coachId,
    model,
    athletes,
    input_tokens: last?.usage.input_tokens ?? 0,
    output_tokens: last?.usage.output_tokens ?? 0,
    cache_read_tokens: last?.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: last?.usage.cache_creation_input_tokens ?? 0,
    cost_usd: costUsd.toFixed(5),
    stop_reason: last?.stop_reason ?? null,
    trigger: "ask",
  });
}
