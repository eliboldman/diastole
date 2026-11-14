import "server-only";

// Self-coaching automation for athletes who coach themselves on an imported plan (plan_meta rows).
// Rules only, no AI. Workouts never change on their own: readiness swaps, moved sessions and goal-pace
// resets are proposals the athlete approves (app/proposals). The one automatic step is delivering
// already-approved plan sessions to Garmin, 7 days ahead.

import { removeWorkoutFromGarmin, resendWorkoutToGarmin, sendWorkoutToGarmin } from "@/lib/garmin/training";
import { createAdminClient } from "@/lib/supabase/server";
import { isKeySession } from "@/lib/training/alerts";
import { addDays, familyOf, mondayOf } from "@/lib/training/week";
import { getWeek } from "@/lib/training/week-data";
import { getZoneSuggestions } from "@/lib/training/zone-suggest-data";
import { ZONE_LABEL, zoneText } from "@/lib/training/zone-suggest";
import type { Brick, Step, Target } from "@/lib/workouts/garmin-format";

import { easyVersion } from "./easy";
import { CHECKPOINTS, LANE_RUN_PACE, PCB_PLAN_ID, PCB_RACE_DATE, fmtClock, laneFor, laneText, metricText, overallLane, type Lane, type MetricKey } from "./plan";
import { pickRescheduleDate } from "./reschedule-rules";
import { redTrend, swapCandidates } from "./week-call";

type Admin = ReturnType<typeof createAdminClient>;
type Athlete = { id: string; full_name: string | null; timezone: string; units: string | null; email: string | null };

const MI = 1609.344;
const today = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz });
const err = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 200);

/** Athletes with plan sessions coming up (or in the last two weeks), real ones only. */
async function planAthletes(admin: Admin, selfCoachedOnly: boolean): Promise<Athlete[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: rows } = await admin.from("planned_workouts").select("athlete_id").not("plan_meta", "is", null).is("deleted_at", null).gte("scheduled_date", since).limit(5000);
  const ids = [...new Set((rows ?? []).map((r) => r.athlete_id as string))];
  if (!ids.length) return [];
  const { data: profiles } = await admin.from("profiles").select("id, full_name, timezone, units, email, coach_id, is_test").in("id", ids);
  return (profiles ?? [])
    .filter((p) => !p.is_test && (!selfCoachedOnly || !p.coach_id || p.coach_id === p.id))
    .map((p) => ({ id: p.id, full_name: p.full_name, timezone: p.timezone || "America/Chicago", units: p.units, email: p.email }));
}

async function hasGarmin(admin: Admin, athleteId: string) {
  const { data } = await admin.from("device_connections").select("source").eq("athlete_id", athleteId).eq("source", "garmin").maybeSingle();
  return Boolean(data);
}

// ------------------------------------------------------------------ 1. delivery (daily)
/** Approved plan sessions in the next 7 days that aren't on the watch yet go to Garmin. */
export async function deliverDuePlanWorkouts(admin: Admin) {
  const out: Record<string, unknown> = {};
  for (const a of await planAthletes(admin, false)) {
    if (!(await hasGarmin(admin, a.id))) continue;
    const from = today(a.timezone);
    const { data: due } = await admin
      .from("planned_workouts")
      .select("id, scheduled_date, title")
      .eq("athlete_id", a.id)
      .not("plan_meta", "is", null)
      .is("deleted_at", null)
      .not("approved_at", "is", null)
      .is("external_id", null)
      .in("status", ["approved", "sent"])
      .gte("scheduled_date", from)
      .lte("scheduled_date", addDays(from, 6))
      .order("scheduled_date");
    let sent = 0;
    const failed: string[] = [];
    for (const w of due ?? []) {
      try {
        await sendWorkoutToGarmin(w.id);
        sent++;
      } catch (e) {
        failed.push(`${w.scheduled_date} ${w.title}: ${err(e)}`);
      }
    }
    if (sent || failed.length) out[a.id] = { sent, failed };
  }
  return out;
}

// ------------------------------------------------------------------ proposals
type NewProposal = { athleteId: string; kind: "readiness_swap" | "reschedule" | "goal_pace" | "deficit_up" | "week_call" | "lighter_days"; workoutId?: string | null; title: string; body: string; payload: Record<string, unknown>; key: string; expiresAt?: string };

export async function propose(admin: Admin, p: NewProposal): Promise<"created" | "exists"> {
  const { data, error } = await admin
    .from("coach_proposals")
    .insert({ athlete_id: p.athleteId, kind: p.kind, workout_id: p.workoutId ?? null, title: p.title, body: p.body, payload: p.payload, dedupe_key: p.key, expires_at: p.expiresAt ?? null })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return "exists";
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  await admin.rpc("server_notify", { p_user: p.athleteId, p_kind: "autocoach", p_title: p.title, p_body: p.body, p_href: `/proposals/${data.id}`, p_key: `proposal:${data.id}` });
  return "created";
}

/** After a change to a workout that may be on the watch: replace it there, or send it if it's due. */
async function syncToWatch(admin: Admin, workoutId: string, tz: string) {
  const { data: w } = await admin.from("planned_workouts").select("scheduled_date, external_id, approved_at, status").eq("id", workoutId).single();
  if (!w) return "";
  const inWindow = w.scheduled_date >= today(tz) && w.scheduled_date <= addDays(today(tz), 6);
  if (w.external_id) {
    if (inWindow) {
      await resendWorkoutToGarmin(workoutId);
      return " Updated on your watch.";
    }
    await removeWorkoutFromGarmin(workoutId);
    return " Taken off your watch for now; it goes back on 7 days before.";
  }
  if (inWindow && w.approved_at && (w.status === "approved" || w.status === "sent")) {
    await sendWorkoutToGarmin(workoutId);
    return " Sent to your watch.";
  }
  return "";
}

/** Apply (or decline) a proposal. The caller has checked the signed-in athlete owns it. */
export async function decideProposal(proposalId: string, athleteId: string, choice: string): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("coach_proposals").select("*").eq("id", proposalId).eq("athlete_id", athleteId).maybeSingle();
  if (!p) return { ok: false, message: "Not found." };
  if (p.status !== "pending") return { ok: false, message: "Already decided." };
  if (p.expires_at && Date.parse(p.expires_at) < Date.now()) {
    await admin.from("coach_proposals").update({ status: "expired" }).eq("id", p.id);
    return { ok: false, message: "This one has expired." };
  }
  const { data: prof } = await admin.from("profiles").select("timezone").eq("id", athleteId).single();
  const tz = prof?.timezone || "America/Chicago";
  const payload = p.payload as Record<string, unknown>;
  let result = "";
  let status: "approved" | "declined" = "approved";
  try {
    if (choice === "keep" || choice === "decline") {
      status = "declined";
      result = "Kept as planned.";
    } else if (p.kind === "readiness_swap" && p.workout_id) {
      const { data: w } = await admin.from("planned_workouts").select("title, description, deleted_at").eq("id", p.workout_id).single();
      const before = payload.before as { title: string };
      if (!w || w.deleted_at || w.title !== before.title) return { ok: false, message: "That session changed since this was suggested, so nothing was applied." };
      if (choice === "check") {
        const note = "Readiness red: start the warm-up as planned. If power or heart rate hasn't come around by 20 minutes, finish the session easy (Z1-Z2, same time). Sluggish legs in the first few minutes are normal.";
        await admin.from("planned_workouts").update({ description: `${note}\n\n${w.description ?? ""}`.slice(0, 1024), updated_at: new Date().toISOString() }).eq("id", p.workout_id);
        result = `Kept as planned, with a 20-minute check.${await syncToWatch(admin, p.workout_id, tz)}`;
      } else if (choice === "rest") {
        await admin.from("planned_workouts").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", p.workout_id);
        await removeWorkoutFromGarmin(p.workout_id);
        result = "Rest day. The session is marked skipped and taken off your watch.";
      } else {
        const after = payload.after as { title: string; steps: Step[]; brick: Brick };
        const note = "Swapped to easy: readiness was red. Original kept in Proposals.";
        await admin
          .from("planned_workouts")
          .update({ title: after.title, steps: after.steps, brick: after.brick, description: `${note}\n\n${w.description ?? ""}`.slice(0, 1024), updated_at: new Date().toISOString() })
          .eq("id", p.workout_id);
        result = `Made it easy.${await syncToWatch(admin, p.workout_id, tz)}`;
      }
    } else if (p.kind === "week_call" || p.kind === "lighter_days") {
      result = await applySwaps(admin, (payload.swaps ?? []) as Swap[], tz, p.kind === "week_call" ? "next week's review" : "a run of red readiness days");
    } else if (p.kind === "reschedule" && p.workout_id) {
      if (choice === "drop") {
        status = "declined";
        result = "Dropped. The plan carries on.";
      } else {
        const to = String(payload.to);
        await admin.from("planned_workouts").update({ scheduled_date: to, updated_at: new Date().toISOString() }).eq("id", p.workout_id);
        result = `Moved to ${to}.${await syncToWatch(admin, p.workout_id, tz)}`;
      }
    } else if (p.kind === "goal_pace") {
      const pace = payload.pace as [number, number];
      result = await resetGoalPace(admin, athleteId, tz, pace);
    } else if (p.kind === "deficit_up") {
      // Race-weight stall: +100 kcal on easy/rest days, capped at 600 (lib/fuel/weight-plan EASY_DEFICIT_CAP).
      const goalId = String(payload.goal_id);
      const { data: g } = await admin.from("weight_goals").select("easy_deficit").eq("id", goalId).eq("athlete_id", athleteId).eq("active", true).maybeSingle();
      if (!g) return { ok: false, message: "That goal isn't active any more, so nothing was applied." };
      const next = Math.min(600, g.easy_deficit + 100);
      await admin.from("weight_goals").update({ easy_deficit: next, updated_at: new Date().toISOString() }).eq("id", goalId);
      const { data: weeks } = await admin.from("weight_goal_weeks").select("week_start, easy_deficit").eq("goal_id", goalId).gte("week_start", String(payload.week_start));
      for (const w of weeks ?? []) await admin.from("weight_goal_weeks").update({ easy_deficit: Math.min(600, w.easy_deficit + 100) }).eq("goal_id", goalId).eq("week_start", w.week_start);
      result = `Easy and rest days now carry a ${next} kcal deficit. Key days are unchanged.`;
    } else {
      return { ok: false, message: "Unknown choice." };
    }
  } catch (e) {
    return { ok: false, message: `Couldn't finish: ${err(e)}` };
  }
  await admin.from("coach_proposals").update({ status, choice, result, decided_at: new Date().toISOString() }).eq("id", p.id);
  return { ok: true, message: result };
}

// ------------------------------------------------------------------ 3. readiness swaps
/** Readiness came in red: offer an easy version (or rest) of today's key session, if it's still ahead. */
export async function proposeReadinessSwap(athleteId: string) {
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("id, timezone, coach_id, is_test").eq("id", athleteId).maybeSingle();
  if (!prof || prof.is_test || (prof.coach_id && prof.coach_id !== prof.id)) return { status: "skipped" };
  const a = { id: prof.id as string, timezone: (prof.timezone as string) || "America/Chicago" };
  const day = today(a.timezone);
  const { data: rs } = await admin.from("readiness_scores").select("overall, note").eq("athlete_id", athleteId).eq("date", day).maybeSingle();
  if (rs?.overall !== "red") return { status: "not red" };
  const [{ data: rows }, { data: zones }, { data: acts }] = await Promise.all([
    admin.from("planned_workouts").select("id, sport, title, steps, brick, start_time, pool_length, pool_unit, plan_meta, status").eq("athlete_id", athleteId).eq("scheduled_date", day).not("plan_meta", "is", null).is("deleted_at", null).in("status", ["approved", "sent"]),
    admin.from("athlete_zones").select("ftp_w, threshold_speed_mps").eq("athlete_id", athleteId).maybeSingle(),
    admin.from("activities").select("sport, start_time").eq("athlete_id", athleteId).gte("start_time", new Date(Date.now() - 20 * 3600_000).toISOString()),
  ]);
  // A run of red days is accumulated load: offer 2-3 lighter days instead of a one-day swap.
  const { data: recent } = await admin.from("readiness_scores").select("date, overall").eq("athlete_id", athleteId).gte("date", addDays(day, -2)).lte("date", day);
  if (redTrend((recent ?? []).map((r) => r.overall))) {
    // One lighter-days offer covers the next 3 days: don't repeat it every red morning.
    const { data: open } = await admin.from("coach_proposals").select("id").eq("athlete_id", athleteId).eq("kind", "lighter_days").gte("created_at", `${addDays(day, -2)}T00:00:00Z`).limit(1);
    if (open?.length) return { status: "trend, already offered" };
    const swaps = await buildSwaps(admin, athleteId, day, addDays(day, 2), "recover", zones ?? {}, a.timezone);
    if (!swaps.length) return { status: "trend, nothing to lighten" };
    const r = await propose(admin, {
      athleteId,
      kind: "lighter_days",
      title: `Red readiness ${(recent ?? []).filter((x) => x.overall === "red").length} of the last 3 days: make the next few days lighter?`,
      body: `${rs.note ?? "Recovery markers are off."} One red day is a day to see how the warm-up goes; a run of them is fatigue building up. This makes ${swaps.map((x) => x.before.title).join(", ")} easy, same time.`,
      payload: { swaps },
      key: `lighter:${athleteId}:${day}`,
      expiresAt: new Date(Date.now() + 20 * 3600_000).toISOString(),
    });
    return { status: "trend", created: r === "created" ? 1 : 0 };
  }
  const nowLocal = new Date().toLocaleTimeString("en-GB", { timeZone: a.timezone, hour: "2-digit", minute: "2-digit" });
  let created = 0;
  for (const w of rows ?? []) {
    if (!["run", "bike", "swim"].includes(w.sport)) continue;
    const key = Boolean((w.plan_meta as { is_key?: boolean } | null)?.is_key) || isKeySession(w.title, (w.steps ?? []) as Step[], w.sport);
    if (!key || /^easy:/i.test(w.title)) continue;
    if ((acts ?? []).some((x) => familyOf(x.sport) === familyOf(w.sport) && new Date(x.start_time).toLocaleDateString("en-CA", { timeZone: a.timezone }) === day)) continue;
    if (w.start_time && nowLocal > addMinutes(String(w.start_time).slice(0, 5), 60)) continue;
    const easy = easyVersion({ sport: w.sport, title: w.title, steps: (w.steps ?? []) as Step[], brick: w.brick as Brick, pool_length: w.pool_length, pool_unit: w.pool_unit }, zones ?? {});
    if (!easy) continue;
    const r = await propose(admin, {
      athleteId,
      kind: "readiness_swap",
      workoutId: w.id,
      title: `Readiness red: start ${w.title} and check in at 20 minutes?`,
      body: `${rs.note ?? "Recovery markers are off."} One red day isn't a verdict: start the warm-up, and if power or heart rate hasn't come around by 20 minutes, finish it easy. Or make it easy now (${easy.summary}), or rest.`,
      payload: { before: { title: w.title, steps: w.steps, brick: w.brick }, after: { title: easy.title, steps: easy.steps, brick: easy.brick }, summary: easy.summary, note: rs.note },
      key: `swap:${w.id}`,
      expiresAt: new Date(Date.now() + 16 * 3600_000).toISOString(),
    });
    if (r === "created") created++;
  }
  return { status: "ok", created };
}
function addMinutes(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + mm + m);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ 4. missed key sessions
/** Morning: yesterday's missed key sessions get a proposed new day (or a note that they're dropped). */
export async function proposeReschedules(admin: Admin) {
  const out: Record<string, unknown> = {};
  for (const a of await planAthletes(admin, true)) {
    const t = today(a.timezone);
    const yesterday = addDays(t, -1);
    const week = await getWeek(admin, a.id, a.timezone, mondayOf(yesterday));
    const missed = week.sessions.filter((s) => s.plan.date === yesterday && s.status === "missed" && ["run", "bike", "swim"].includes(s.plan.sport) && isKeySession(s.plan.title, s.plan.steps, s.plan.sport));
    if (!missed.length) continue;
    const { data: upcoming } = await admin
      .from("planned_workouts")
      .select("id, scheduled_date, sport, title, steps, plan_meta")
      .eq("athlete_id", a.id)
      .is("deleted_at", null)
      .not("status", "in", "(draft,skipped)")
      .gte("scheduled_date", t)
      .lte("scheduled_date", addDays(t, 5));
    const days = (upcoming ?? []).map((u) => ({ date: u.scheduled_date as string, sport: u.sport as string, key: Boolean((u.plan_meta as { is_key?: boolean } | null)?.is_key) || isKeySession(u.title, (u.steps ?? []) as Step[], u.sport) }));
    const results: string[] = [];
    for (const s of missed) {
      const to = pickRescheduleDate({ sport: s.plan.sport }, days, t, PCB_RACE_DATE);
      if (to) {
        const dow = new Date(`${to}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
        results.push(
          await propose(admin, {
            athleteId: a.id,
            kind: "reschedule",
            workoutId: s.plan.id,
            title: `Move missed ${s.plan.title} to ${dow}?`,
            body: `Yesterday's key session didn't happen. ${dow} keeps a day between key sessions and fits your mornings.`,
            payload: { from: yesterday, to },
            key: `move:${s.plan.id}`,
            expiresAt: new Date(Date.parse(`${to}T12:00:00Z`)).toISOString(),
          }),
        );
        days.push({ date: to, sport: s.plan.sport, key: true });
      } else {
        await admin.rpc("server_notify", {
          p_user: a.id,
          p_kind: "autocoach",
          p_title: `Missed ${s.plan.title}: dropped`,
          p_body: "No day in the next three fits without stacking key sessions, so it's dropped and the plan carries on. Don't make it up.",
          p_href: `/athlete/${a.id}#week`,
          p_key: `drop:${s.plan.id}`,
        });
        results.push("dropped");
      }
    }
    out[a.id] = results;
  }
  return out;
}

// ------------------------------------------------------------------ 1b. test results -> zones
/** Evening: a new test result gets an immediate "apply your new zone" notification (the morning run repeats it). */
export async function notifyTestZones(admin: Admin) {
  const athletes = await planAthletes(admin, true);
  const sugg = await getZoneSuggestions(admin, athletes.map((a) => a.id));
  let sent = 0;
  for (const [id, list] of sugg) {
    const a = athletes.find((x) => x.id === id)!;
    const units = a.units === "km" ? "km" : "mi";
    for (const s of list) {
      if (!s.test || Date.now() - Date.parse(s.date) > 36 * 3600_000) continue;
      await admin.rpc("server_notify", {
        p_user: id,
        p_kind: "zone_suggestion",
        p_title: `New ${ZONE_LABEL[s.key]} from your ${s.test.title}`,
        p_body: `${zoneText(s.key, s.current, units)} → ${zoneText(s.key, s.suggested, units)}. Apply it and every upcoming workout re-works to the new number; the next 7 days update on your watch.`,
        p_href: `/athlete/${id}#zones`,
        p_key: `zone:${id}:${s.key}:${s.suggested}`,
      });
      sent++;
    }
  }
  return { sent };
}

// ------------------------------------------------------------------ 5. checkpoints
async function checkpointMetrics(admin: Admin, athleteId: string, cp: (typeof CHECKPOINTS)[number]) {
  const v: Partial<Record<MetricKey, number>> = {};
  const { data: z } = await admin.from("athlete_zones").select("ftp_w, threshold_speed_mps, css_sec_per_100m, updated_at").eq("athlete_id", athleteId).maybeSingle();
  const fresh = z?.updated_at && z.updated_at.slice(0, 10) >= cp.from;
  if (fresh && z?.ftp_w) v.ftp = Number(z.ftp_w);
  if (fresh && z?.threshold_speed_mps) v.thr = MI / Number(z.threshold_speed_mps);
  if (fresh && z?.css_sec_per_100m) v.css = Number(z.css_sec_per_100m) * 0.9144;
  const from = new Date(Date.parse(`${cp.from}T00:00:00Z`) - 86_400_000).toISOString();
  const to = new Date(Date.parse(`${cp.to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
  const { data: acts } = await admin.from("activities").select("id, sport, start_time, duration_s, distance_m, avg_speed_mps, avg_power").eq("athlete_id", athleteId).gte("start_time", from).lt("start_time", to);
  if (cp.metrics.some((m) => m.key === "run10k")) {
    const runs = (acts ?? []).filter((x) => familyOf(x.sport) === "run").map((x) => x.id);
    if (runs.length) {
      const { data: det } = await admin.from("activity_details").select("bests").in("activity_id", runs);
      const best = Math.min(...(det ?? []).map((d) => Number((d.bests as { run_10k?: number } | null)?.run_10k ?? Infinity)));
      if (Number.isFinite(best)) v.run10k = best;
    }
  }
  if (cp.n === 3) {
    const ride = (acts ?? []).filter((x) => familyOf(x.sport) === "bike").sort((p, q) => Number(q.distance_m ?? 0) - Number(p.distance_m ?? 0))[0];
    if (ride && Number(ride.distance_m) > 60_000 && ride.avg_speed_mps) {
      v.simMph = Number(ride.avg_speed_mps) * 2.23694;
      if (ride.avg_power && z?.ftp_w) v.simIf = Number(ride.avg_power) / Number(z.ftp_w);
    }
    const run = (acts ?? []).filter((x) => familyOf(x.sport) === "run" && ride && x.start_time > ride.start_time).sort((p, q) => p.start_time.localeCompare(q.start_time))[0];
    if (run?.avg_speed_mps) v.simRunPace = MI / Number(run.avg_speed_mps);
  }
  return v;
}

/** Morning: score checkpoints whose window has ended, and offer a goal-pace reset off the 3:55 lane. */
export async function evaluateCheckpoints(admin: Admin) {
  const out: Record<string, unknown> = {};
  for (const a of await planAthletes(admin, true)) {
    const t = today(a.timezone);
    for (const cp of CHECKPOINTS) {
      if (cp.to >= t || addDays(cp.to, 14) < t) continue;
      const { data: done } = await admin.from("plan_checkpoints").select("lane").eq("athlete_id", a.id).eq("plan_id", PCB_PLAN_ID).eq("checkpoint", cp.n).maybeSingle();
      if (done?.lane) continue;
      const v = await checkpointMetrics(admin, a.id, cp);
      const measured = cp.metrics.filter((m) => v[m.key] !== undefined);
      // Wait up to a week for every test to be logged, then score what's there.
      if (measured.length < cp.metrics.length && addDays(cp.to, 7) > t) continue;
      if (!measured.length) continue;
      const results = Object.fromEntries(measured.map((m) => [m.key, { value: v[m.key], lane: laneFor(m, v[m.key]!), label: m.label }]));
      const lane = overallLane(measured.map((m) => laneFor(m, v[m.key]!))) as Lane;
      await admin.from("plan_checkpoints").upsert({ athlete_id: a.id, plan_id: PCB_PLAN_ID, checkpoint: cp.n, results, lane, evaluated_at: new Date().toISOString() });
      const lines = measured.map((m) => `${m.label} ${metricText(m.key, v[m.key]!)} (${laneFor(m, v[m.key]!)})`).join(" · ");
      await admin.rpc("server_notify", { p_user: a.id, p_kind: "autocoach", p_title: `${cp.label}${cp.progressOnly ? " (progress check)" : ""}: ${laneText(cp, lane)}`, p_body: cp.progressOnly ? `${lines}. A progress check, not a lane call: the lane is decided at Checkpoint 2.` : lines, p_href: "/proposals", p_key: `cp:${a.id}:${cp.n}` });
      if (!cp.progressOnly && lane !== "3:55") {
        const pace: [number, number] = cp.n === 3 && v.simRunPace ? [Math.round(v.simRunPace - 3), Math.round(v.simRunPace + 3)] : LANE_RUN_PACE["4:05"];
        await propose(admin, {
          athleteId: a.id,
          kind: "goal_pace",
          title: `Reset goal race pace to ${fmtClock(pace[0])}–${fmtClock(pace[1])}/mi?`,
          body: `${cp.label} put you in the ${lane} lane. Race-pace runs are fixed at 6:14–6:20/mi for 3:55; this resets every upcoming one to ${fmtClock(pace[0])}–${fmtClock(pace[1])}/mi.`,
          payload: { pace, checkpoint: cp.n, lane },
          key: `pace:${a.id}:${cp.n}`,
        });
      }
      out[`${a.id}:${cp.n}`] = lane;
    }
  }
  return out;
}

/** Goal race pace steps are the plan's only fixed run paces (pace targets without a zone percentage). */
async function resetGoalPace(admin: Admin, athleteId: string, tz: string, paceSecPerMi: [number, number]) {
  const target: Target = { type: "pace_range", fastSecPerKm: Math.round((paceSecPerMi[0] * 1000) / MI), slowSecPerKm: Math.round((paceSecPerMi[1] * 1000) / MI) };
  const swap = (steps: Step[]): { steps: Step[]; n: number } => {
    let n = 0;
    const walk = (ss: Step[]): Step[] =>
      ss.map((s) => {
        if (s.kind === "repeat") return { ...s, steps: walk(s.steps) };
        const t = s.target as (Target & { rel?: unknown }) | undefined;
        if (t?.type === "pace_range" && !t.rel) {
          n++;
          return { ...s, target };
        }
        return s;
      });
    return { steps: walk(steps), n };
  };
  const { data: rows } = await admin.from("planned_workouts").select("id, sport, steps, brick").eq("athlete_id", athleteId).not("plan_meta", "is", null).is("deleted_at", null).gte("scheduled_date", today(tz)).in("sport", ["run", "bike"]);
  let changed = 0;
  let watch = 0;
  for (const r of rows ?? []) {
    const main = r.sport === "run" ? swap((r.steps ?? []) as Step[]) : { steps: r.steps as Step[], n: 0 };
    const brick = r.brick ? swap((r.brick as { steps: Step[] }).steps) : null;
    if (!main.n && !brick?.n) continue;
    await admin.from("planned_workouts").update({ steps: main.steps, ...(brick ? { brick: { ...(r.brick as object), steps: brick.steps } } : {}), updated_at: new Date().toISOString() }).eq("id", r.id);
    changed++;
    if ((await syncToWatch(admin, r.id, tz)).includes("watch")) watch++;
  }
  return `Goal pace reset on ${changed} upcoming ${changed === 1 ? "session" : "sessions"}${watch ? `; ${watch} updated on your watch` : ""}.`;
}

// ------------------------------------------------------------------ 3b. lighter days (hold / recover / red trend)
export type Swap = { workoutId: string; date: string; before: { title: string; steps: unknown; brick: unknown }; after: { title: string; steps: Step[]; brick: Brick }; summary: string };

/** Easy versions of the sessions a hold / recover call would lighten, from `from` through `to`. */
export async function buildSwaps(admin: Admin, athleteId: string, from: string, to: string, mode: "hold" | "recover", zones: { ftp_w?: number | null; threshold_speed_mps?: number | null }, tz: string): Promise<Swap[]> {
  const { data: rows } = await admin
    .from("planned_workouts")
    .select("id, scheduled_date, sport, title, steps, brick, pool_length, pool_unit, plan_meta, test_kind, start_time")
    .eq("athlete_id", athleteId)
    .not("plan_meta", "is", null)
    .is("deleted_at", null)
    .in("status", ["approved", "sent"])
    .gte("scheduled_date", from)
    .lte("scheduled_date", to);
  // Nothing already done today.
  const { data: acts } = await admin.from("activities").select("sport, start_time").eq("athlete_id", athleteId).gte("start_time", `${from}T00:00:00Z`).lte("start_time", `${addDays(to, 1)}T12:00:00Z`);
  const doneOn = (d: string, sport: string) => (acts ?? []).some((x) => familyOf(x.sport) === familyOf(sport) && new Date(x.start_time).toLocaleDateString("en-CA", { timeZone: tz }) === d);
  const live = (rows ?? []).filter((w) => !/^easy:/i.test(w.title) && !doneOn(w.scheduled_date, w.sport));
  const meta = (w: (typeof live)[number]) => (w.plan_meta ?? {}) as { is_key?: boolean; category?: string };
  const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
  const picked = swapCandidates(
    live.map((w) => ({ id: w.id, date: w.scheduled_date, sport: w.sport, key: Boolean(meta(w).is_key), category: meta(w).category ?? null, test: Boolean(w.test_kind) })),
    mode,
    from,
    days,
  );
  const out: Swap[] = [];
  for (const c of picked) {
    const w = live.find((x) => x.id === c.id)!;
    const easy = easyVersion({ sport: w.sport, title: w.title, steps: (w.steps ?? []) as Step[], brick: w.brick as Brick, pool_length: w.pool_length, pool_unit: w.pool_unit }, zones);
    if (easy) out.push({ workoutId: w.id, date: w.scheduled_date, before: { title: w.title, steps: w.steps, brick: w.brick }, after: { title: easy.title, steps: easy.steps, brick: easy.brick }, summary: easy.summary });
  }
  return out;
}

async function applySwaps(admin: Admin, swaps: Swap[], tz: string, why: string) {
  let changed = 0;
  let watch = 0;
  const skipped: string[] = [];
  for (const s of swaps) {
    const { data: w } = await admin.from("planned_workouts").select("title, description, deleted_at, scheduled_date").eq("id", s.workoutId).single();
    if (!w || w.deleted_at || w.title !== s.before.title || w.scheduled_date < today(tz)) {
      skipped.push(s.before.title);
      continue;
    }
    await admin
      .from("planned_workouts")
      .update({ title: s.after.title, steps: s.after.steps, brick: s.after.brick, description: `Made easy after ${why}. Original kept in Proposals.\n\n${w.description ?? ""}`.slice(0, 1024), updated_at: new Date().toISOString() })
      .eq("id", s.workoutId);
    changed++;
    if ((await syncToWatch(admin, s.workoutId, tz)).includes("watch")) watch++;
  }
  return `${changed} ${changed === 1 ? "session" : "sessions"} made easy${watch ? `, ${watch} updated on your watch` : ""}.${skipped.length ? ` Left alone (changed or past): ${skipped.join(", ")}.` : ""}`;
}

// ------------------------------------------------------------------ 6. weekly review (data; email in review.ts)
export { planAthletes, today as localToday };
