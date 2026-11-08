"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { approveAndSend } from "@/app/(coach)/athlete/[id]/workouts/actions";
import { apiErrorText } from "@/lib/ai/api-error";
import { buildWorkoutFromPrompt } from "@/lib/ai/build-workout";
import { costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { SwapOut } from "@/lib/ai/step-schema";
import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import { deleteWorkouts, rescheduleWorkout } from "@/lib/workouts/actions";
import type { Sport, Step } from "@/lib/workouts/garmin-format";

// "Change of plans": the coach says what's changing in a sentence ("easy long run instead of the
// bike today"). Claude reads the next days of the schedule and returns what to remove, move and
// add; each new workout goes through the regular "Describe it" builder and its watch checks.
// Nothing changes until the coach taps "Do it".

const MODEL: AiModel = "claude-haiku-5-5";
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const SYSTEM = `You help an endurance coach change a training schedule in plain words. The coach says what's changing, for example "doing an easy long run instead of the bike today", "Sam is sick, push Tuesday's intervals to Thursday", or "add a 30 min recovery spin tomorrow".

You get today's date, a roster (the coach and their athletes) and each person's scheduled workouts for the coming days, with ids. Return exactly what to change:
- athlete_id: who it's about. The coach themself unless the coach names an athlete.
- remove_ids: workouts being replaced or cancelled. "Instead of" a session means remove that session.
- moves: sessions that keep their content but change day.
- adds: new sessions, each described in plain words for a workout builder. Keep the coach's words; when the coach didn't give a length for a replacement, use about the same total time as the session it replaces and say so in the description (e.g. "about 75 min, the same as the ride it replaces").
- Dates: "today", "tomorrow", weekdays and "yesterday" are relative to today's date given. Never pick a date before yesterday.
- Only use ids from the list. Don't touch anything the coach didn't mention.
- summary: one short, friendly line describing the change.
- question: only when you can't tell which session or person the coach means; then leave the lists empty.`;

export type SwapPreview = {
  athleteId: string;
  athleteName: string;
  summary: string;
  removes: { id: string; title: string; date: string }[];
  moves: { id: string; title: string; from: string; to: string }[];
  adds: { date: string; title: string; sport: Sport; description: string | null; steps: Step[]; lines: string[]; note: string | null }[];
};
export type SwapPlan = { ok: true; preview: SwapPreview; costUsd: number } | { ok: true; question: string } | { ok: false; error: string };

const dayIn = (tz: string, offset = 0) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: tz });

/** Read the coach's sentence and propose the change. Nothing is saved. */
export async function planChange(input: { text: string; athleteId?: string | null }): Promise<SwapPlan> {
  const me = await requireCoach();
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 800);
  if (!text) return { ok: false, error: "Say what's changing first." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "No Anthropic API key is configured." };
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: s } = await admin.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "The coaching assistant is turned off in Me → Coaching assistant." };
  if ((await monthToDateSpend(me.id)) >= Number(settings.ai_monthly_cap_usd) - 0.01) return { ok: false, error: "Monthly AI cap reached." };

  // Roster: the coach and their athletes (row-level security keeps this to the coach's own).
  const { data: people } = await supabase.from("profiles").select("id, full_name, timezone").or(`id.eq.${me.id},coach_id.eq.${me.id}`).limit(60);
  const roster = (people ?? []).filter((p) => !input.athleteId || p.id === input.athleteId);
  if (!roster.length) return { ok: false, error: "That athlete isn't yours." };
  const tz = (roster.find((p) => p.id === (input.athleteId ?? me.id)) ?? roster[0]).timezone || me.timezone;
  const today = dayIn(tz);

  const { data: planned } = await supabase
    .from("planned_workouts")
    .select("id, athlete_id, title, sport, scheduled_date, steps, status, pool_length, pool_unit")
    .in("athlete_id", roster.map((p) => p.id))
    .is("deleted_at", null)
    .gte("scheduled_date", dayIn(tz, -1))
    .lte("scheduled_date", dayIn(tz, 14))
    .order("scheduled_date")
    .limit(300);
  const byId = new Map((planned ?? []).map((w) => [w.id, w]));
  const minutes = (steps: Step[]) => {
    let t = 0;
    const walk = (list: Step[], times = 1) => {
      for (const x of list) {
        if (x.kind === "repeat") walk(x.steps, times * x.times);
        else if (x.duration.type === "time") t += x.duration.seconds * times;
      }
    };
    walk(steps);
    return t ? Math.round(t / 60) : null;
  };
  const context = {
    today: `${today} (${new Date(`${today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`,
    coach_id: me.id,
    roster: roster.map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed", is_coach: p.id === me.id })),
    scheduled: (planned ?? []).map((w) => ({
      id: w.id,
      athlete_id: w.athlete_id,
      date: w.scheduled_date,
      weekday: new Date(`${w.scheduled_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      sport: w.sport,
      title: w.title,
      minutes: minutes((w.steps ?? []) as Step[]),
      draft: w.status === "draft",
    })),
  };

  const client = new Anthropic();
  let total = 0;
  try {
    const r = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(SwapOut) },
      messages: [{ role: "user", content: `Context (JSON): ${JSON.stringify(context)}\n\nThe coach says: ${text}` }],
    });
    total += costOf(MODEL, r.usage);
    await admin.from("ai_usage").insert({
      coach_id: me.id,
      model: MODEL,
      athletes: 1,
      input_tokens: r.usage.input_tokens ?? 0,
      output_tokens: r.usage.output_tokens ?? 0,
      cache_read_tokens: r.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: r.usage.cache_creation_input_tokens ?? 0,
      cost_usd: costOf(MODEL, r.usage).toFixed(5),
      stop_reason: r.stop_reason,
      trigger: "swap",
    });
    const o = r.parsed_output;
    if (!o) return { ok: false, error: "I couldn't work that out. Try saying it another way." };
    if (o.question.trim()) return { ok: true, question: o.question.trim() };

    const who = roster.find((p) => p.id === o.athlete_id) ?? roster.find((p) => p.id === (input.athleteId ?? me.id)) ?? roster[0];
    const mine = (id: string) => {
      const w = byId.get(id);
      return w && w.athlete_id === who.id ? w : null;
    };
    const removes = [...new Set(o.remove_ids)].map(mine).filter((w) => !!w).map((w) => ({ id: w.id, title: w.title, date: w.scheduled_date }));
    const moves = o.moves
      .filter((m) => DATE.test(m.date) && m.date >= dayIn(tz, -1) && !o.remove_ids.includes(m.id))
      .map((m) => ({ m, w: mine(m.id) }))
      .filter((x) => x.w && x.w.scheduled_date !== x.m.date)
      .map(({ m, w }) => ({ id: w!.id, title: w!.title, from: w!.scheduled_date, to: m.date }));

    // Each new session goes through the regular builder (cheapest model first, watch checks).
    const unit = me.units === "km" ? "km" : "mi";
    const adds: SwapPreview["adds"] = [];
    for (const a of o.adds.slice(0, 4)) {
      if (!DATE.test(a.date) || a.date < dayIn(tz, -1)) continue;
      const built = await buildWorkoutFromPrompt({ athleteId: who.id, prompt: a.description, sport: null, paceUnit: unit, pool: null });
      if (!built.ok) return { ok: false, error: `Couldn't build “${a.description.slice(0, 60)}”: ${built.error}` };
      total += built.costUsd;
      adds.push({ date: a.date, title: built.title, sport: built.sport, description: built.description, steps: built.steps, lines: describe(built.steps, unit, null, built.sport === "swim"), note: built.assumptions });
    }
    if (!removes.length && !moves.length && !adds.length) return { ok: true, question: "I didn't find anything to change. Which session do you mean?" };
    return { ok: true, costUsd: total, preview: { athleteId: who.id, athleteName: who.id === me.id ? "you" : (who.full_name ?? "this athlete").split(" ")[0], summary: o.summary.trim().slice(0, 200), removes, moves, adds } };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is busy right now. Try again in a moment." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: apiErrorText(e, "swap") };
    throw e;
  }
}

/** Do it: add the new sessions (approved and sent to the watch), then move and remove. */
export async function applyChange(p: SwapPreview): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireCoach();
  if (!UUID.test(p.athleteId)) return { ok: false, error: "Unknown athlete." };
  const supabase = await createClient();
  // Row-level security limits these reads to the coach's own athletes.
  const { data: rows } = await supabase.from("planned_workouts").select("id, athlete_id").in("id", [...p.removes.map((r) => r.id), ...p.moves.map((m) => m.id)]);
  const ok = new Set((rows ?? []).filter((r) => r.athlete_id === p.athleteId).map((r) => r.id));
  const notes: string[] = [];

  for (const a of p.adds) {
    const r = await approveAndSend({ athleteId: p.athleteId, title: a.title, sport: a.sport, scheduledDate: a.date, description: a.description ?? "", steps: a.steps, pool: null });
    if (!r.ok) return { ok: false, error: `Couldn't add ${a.title}: ${r.error}` };
    if (r.message && !notes.includes(r.message)) notes.push(r.message);
  }
  for (const m of p.moves.filter((x) => ok.has(x.id) && DATE.test(x.to))) {
    const r = await rescheduleWorkout(m.id, m.to);
    if (!r.ok) notes.push(`Couldn't move ${m.title}.`);
  }
  const removeIds = p.removes.map((r) => r.id).filter((id) => ok.has(id));
  if (removeIds.length) {
    const r = await deleteWorkouts(removeIds);
    if (r.ok && r.message?.includes("couldn't")) notes.push(r.message);
  }
  return { ok: true, message: ["Done.", ...notes].join(" ") };
}

