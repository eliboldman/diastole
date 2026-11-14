import "server-only";

// Evening job for race-weight goals (lib/fuel/weight-plan.ts):
//  - every evening: recovery/performance/low-energy checks; a hit pauses the deficit (7 days, 14 for low energy);
//  - Sunday evening (athlete's time): next week's state: measured baseline, fast-loss cut, stall proposal,
//    behind-the-line date move. Guardrail hits notify the athlete; the stall rule asks first.

import { propose } from "@/lib/autocoach/server";
import type { createAdminClient } from "@/lib/supabase/server";

import { currentKg, getActiveGoal, getWeekRows, getWeighs, intakeDays, weekFor, type WeekRow } from "./weight-data";
import { addDays, estimatedBaseline, measuredBaseline, mondayOf, pauseCheck, weekly, type Goal, type Guardrail, type WeeklyInput } from "./weight-plan";

type Admin = ReturnType<typeof createAdminClient>;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function signals(admin: Admin, athleteId: string, today: string, rows: WeekRow[]) {
  const since28 = addDays(today, -27);
  const since7 = addDays(today, -6);
  const [{ data: rs }, { data: well }, { data: zones }, { data: cis }, { data: prof }, { data: rides }] = await Promise.all([
    admin.from("readiness_scores").select("date, overall").eq("athlete_id", athleteId).gte("date", since7),
    admin.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds, sleep_score").eq("athlete_id", athleteId).gte("date", since28),
    admin.from("athlete_zones").select("ftp_w").eq("athlete_id", athleteId).maybeSingle(),
    admin.from("energy_checkins").select("week_start, fatigue, low_libido, ill, low_mood").eq("athlete_id", athleteId).order("week_start", { ascending: false }).limit(2),
    admin.from("profiles").select("health_pause").eq("id", athleteId).single(),
    admin
      .from("activities")
      .select("start_time, normalized_power, avg_power, duration_s, planned_workout_id")
      .eq("athlete_id", athleteId)
      .gte("start_time", `${addDays(today, -21)}T00:00:00Z`)
      .not("planned_workout_id", "is", null),
  ]);
  const w = well ?? [];
  const pick = (from: string, k: "hrv_ms" | "resting_hr" | "sleep_seconds" | "sleep_score") => mean(w.filter((x) => x.date >= from && x[k] !== null).map((x) => Number(x[k])));
  const sleep7 = pick(since7, "sleep_seconds");

  // Key-ride power per week (oldest → newest), from rides linked to a key plan session.
  const ids = [...new Set((rides ?? []).map((r) => r.planned_workout_id as string))];
  const { data: keyRows } = ids.length
    ? await admin.from("planned_workouts").select("id, sport, test_kind, plan_meta").in("id", ids)
    : { data: [] as { id: string; sport: string; test_kind: string | null; plan_meta: { is_key?: boolean } | null }[] };
  const keyIds = new Set((keyRows ?? []).filter((k) => k.sport === "bike" && (k.plan_meta?.is_key || k.test_kind)).map((k) => k.id));
  const keyPowerByWeek = [2, 1, 0].map((ago) => {
    const end = addDays(today, -7 * ago);
    const start = addDays(end, -6);
    const p = (rides ?? [])
      .filter((r) => keyIds.has(r.planned_workout_id!) && (r.duration_s ?? 0) >= 1800)
      .filter((r) => {
        const d = r.start_time.slice(0, 10);
        return d >= start && d <= end;
      })
      .map((r) => Number(r.normalized_power ?? r.avg_power))
      .filter((x) => x > 0);
    return mean(p);
  });
  const ftpNow = zones?.ftp_w ?? null;
  const ftpByWeek = [...rows.slice(-2).map((r) => r.ftp_w ?? null), ftpNow];
  const hp = prof?.health_pause as { kind?: string } | null;
  return {
    ftpNow,
    ftpByWeek,
    keyPowerByWeek,
    readiness7: (rs ?? []).map((r) => r.overall as string),
    hrv7: pick(since7, "hrv_ms"),
    hrv28: pick(since28, "hrv_ms"),
    sleepH7: sleep7 === null ? null : sleep7 / 3600,
    sleepScore7: pick(since7, "sleep_score"),
    rhr7: pick(since7, "resting_hr"),
    rhr28: pick(since28, "resting_hr"),
    checkins: cis ?? [],
    sick: hp?.kind === "sick" || hp?.kind === "injured",
  };
}

async function notify(admin: Admin, athleteId: string, g: Guardrail, key: string) {
  const title = { fast_loss: "Losing a bit fast", stall: "Weight's been flat 3 weeks", behind: "Race-weight date moved", performance: "Deficit paused: power", recovery: "Deficit paused: recovery", low_energy: "Deficit off: low energy signs" }[g.rule];
  await admin.rpc("server_notify", { p_user: athleteId, p_kind: "weight_goal", p_title: title, p_body: g.message, p_href: "/fuel/weight", p_key: key });
}

function rowFrom(goal: Goal, athleteId: string, weekStart: string, w: Omit<WeekRow, "week_start" | "computed_at">) {
  return {
    goal_id: goal.id,
    athlete_id: athleteId,
    week_start: weekStart,
    avg_kg: w.avg_kg,
    planned_kg: w.planned_kg,
    rate_lb_wk: w.rate_lb_wk,
    baseline_kcal: w.baseline_kcal,
    baseline_source: w.baseline_source,
    easy_deficit: w.easy_deficit,
    moderate_deficit: w.moderate_deficit,
    pause_until: w.pause_until,
    pause_reason: w.pause_reason?.slice(0, 300) ?? null,
    target_date: w.target_date,
    ftp_w: w.ftp_w,
    guardrails: w.guardrails,
    computed_at: new Date().toISOString(),
  };
}

/** One athlete. `force` runs the Sunday part on any day (dry checks and tests). */
export async function runWeightGoal(admin: Admin, athleteId: string, timeZone: string, opts: { force?: boolean } = {}) {
  const goal = await getActiveGoal(admin, athleteId);
  if (!goal) return { status: "no goal" };
  const today = new Date().toLocaleDateString("en-CA", { timeZone });
  if (today < addDays(goal.start_date, -1)) return { status: "not started" };
  const [weighs, rows] = await Promise.all([getWeighs(admin, athleteId, addDays(goal.start_date, -35)), getWeekRows(admin, goal.id)]);
  const kg = currentKg(weighs, today, goal);
  const s = await signals(admin, athleteId, today, rows);
  const monday = mondayOf(today);
  const current = weekFor(rows, today, goal, kg);
  const out: Record<string, unknown> = {};

  // Every evening: pause checks (only once per pause; a running pause isn't restarted).
  const hit = pauseCheck(s);
  const pausedNow = current.pause_until && current.pause_until >= today;
  if (hit && !pausedNow && today <= goal.maintain_until) {
    const until = addDays(today, hit.rule === "low_energy" ? 14 : 7);
    const existing = rows.find((r) => r.week_start === monday);
    const base = existing ?? { ...current, avg_kg: null, planned_kg: null, rate_lb_wk: null, ftp_w: s.ftpNow, guardrails: [] };
    await admin.from("weight_goal_weeks").upsert(rowFrom(goal, athleteId, monday, { ...base, pause_until: until, pause_reason: hit.message, guardrails: [...(base.guardrails ?? []), hit] }));
    await notify(admin, athleteId, hit, `wg:pause:${goal.id}:${today}`);
    out.pause = hit.rule;
  }

  // Sunday: next week's state.
  const sunday = new Date(`${today}T12:00:00Z`).getUTCDay() === 0;
  if (!sunday && !opts.force) return { status: "daily", ...out };
  const nextMonday = addDays(monday, 7);
  const intake = await intakeDays(admin, athleteId, goal, rows, weighs, addDays(today, -27), 28, timeZone);
  const estimate = estimatedBaseline(kg, goal, nextMonday);
  const measured = measuredBaseline(intake, weighs, today, current.baseline_kcal, estimate);
  const refreshed = await getWeekRows(admin, goal.id); // includes a pause written above
  const input: WeeklyInput = { today, goal, prev: weekFor(refreshed, today, goal, kg), weighs, ...s, baselineEstimate: estimate, baselineMeasured: measured };
  const r = weekly(input);
  // A pause found tonight was already announced above.
  const fresh = r.guardrails.filter((g) => !(hit && g.rule === hit.rule));
  await admin.from("weight_goal_weeks").upsert(rowFrom(goal, athleteId, nextMonday, { ...r, ftp_w: s.ftpNow, guardrails: r.guardrails }));
  if (r.target_date !== goal.target_date) await admin.from("weight_goals").update({ target_date: r.target_date, updated_at: new Date().toISOString() }).eq("id", goal.id);
  for (const g of fresh) if (g.rule !== "stall") await notify(admin, athleteId, g, `wg:${g.rule}:${goal.id}:${nextMonday}`);
  if (r.proposeDeficitUp) {
    out.proposal = await propose(admin, {
      athleteId,
      kind: "deficit_up",
      title: "Weight's been flat for 3 weeks",
      body: `Your 7-day average hasn't moved in 3 weeks. Add 100 kcal to the deficit on easy and rest days only (to ${Math.min(600, r.easy_deficit + 100)} kcal)? Key, long-session and test days keep their current amounts either way.`,
      payload: { goal_id: goal.id, week_start: nextMonday },
      key: `deficit_up:${goal.id}:${nextMonday}`,
      expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
    });
  }
  return { status: "weekly", ...out, baseline: r.baseline_kcal, source: r.baseline_source, guardrails: r.guardrails.map((g) => g.rule) };
}

/** Every athlete with an active goal (real accounts only). */
export async function runWeightGoals(admin: Admin, opts: { force?: boolean } = {}) {
  const { data: goals } = await admin.from("weight_goals").select("athlete_id").eq("active", true);
  const ids = (goals ?? []).map((g) => g.athlete_id as string);
  if (!ids.length) return {};
  const { data: profs } = await admin.from("profiles").select("id, timezone, is_test").in("id", ids);
  const out: Record<string, unknown> = {};
  for (const p of profs ?? []) {
    if (p.is_test) continue;
    try {
      out[p.id] = await runWeightGoal(admin, p.id, p.timezone || "America/Chicago", opts);
    } catch (e) {
      out[p.id] = { status: "error", reason: String(e).slice(0, 200) };
    }
  }
  return out;
}
