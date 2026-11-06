import "server-only";

import { estimateSession, fuelDay, type FuelDay, type Session } from "@/lib/fuel/plan";
import { evaluateSafety, shouldNotifyAgain, type SafetyDay } from "@/lib/fuel/safety";
import { createAdminClient } from "@/lib/supabase/server";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

// Morning job: check each of a coach's athletes for the safety-net pattern and write a private
// note for the coach. Rules only, no AI, no cost. Runs with the service role (no user session).

const DAY = 86_400_000;
const LEVELS: FuelDay[] = ["low", "medium", "high"];
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const localDate = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });
const localHour = (iso: string, tz: string) => {
  const [h, m] = new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).split(":").map(Number);
  return (h % 24) + m / 60;
};

type Admin = ReturnType<typeof createAdminClient>;

async function checkAthlete(admin: Admin, coachId: string, athlete: { id: string; timezone: string | null }) {
  const tz = athlete.timezone || "America/Chicago";
  const today = localDate(new Date().toISOString(), tz);
  const from = addDays(today, -7);
  const yesterday = addDays(today, -1);

  const [{ data: body }, { data: meals }, { data: plans }, { data: zones }, { data: acts }, { data: readiness }, { data: checkins }] = await Promise.all([
    admin.from("athlete_body").select("weight_kg").eq("athlete_id", athlete.id).maybeSingle(),
    admin.from("meal_logs").select("local_date, eaten_at, kcal, carbs_g").eq("athlete_id", athlete.id).gte("local_date", from).lte("local_date", yesterday),
    admin
      .from("planned_workouts")
      .select("scheduled_date, sport, steps, pool_length, pool_unit")
      .eq("athlete_id", athlete.id)
      .is("deleted_at", null)
      .not("status", "in", "(draft,skipped)")
      .gte("scheduled_date", from)
      .lte("scheduled_date", yesterday),
    admin.from("athlete_zones").select("threshold_speed_mps, ftp_w").eq("athlete_id", athlete.id).maybeSingle(),
    admin.from("activities").select("start_time, duration_s").eq("athlete_id", athlete.id).gte("start_time", new Date(Date.now() - 36 * DAY).toISOString()),
    admin.from("readiness_scores").select("overall").eq("athlete_id", athlete.id).gte("date", addDays(today, -6)).lte("date", today),
    admin.from("workout_checkins").select("feel, created_at").eq("athlete_id", athlete.id).not("feel", "is", null).gte("created_at", new Date(Date.now() - 14 * DAY).toISOString()).order("created_at", { ascending: false }).limit(4),
  ]);
  if (!body?.weight_kg || !(meals ?? []).length) return "skipped";

  // Each finished day's fuel level: planned sessions, raised by what was actually done.
  const days: SafetyDay[] = [];
  for (let i = -7; i <= -1; i++) {
    const date = addDays(today, i);
    const planned: Session[] = (plans ?? [])
      .filter((p) => p.scheduled_date === date)
      .map((p) => {
        const pool: Pool = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
        return estimateSession((p.steps ?? []) as Step[], p.sport, zones, pool);
      });
    const done: Session[] = (acts ?? [])
      .filter((a) => a.start_time && localDate(a.start_time, tz) === date && (a.duration_s ?? 0) >= 300)
      .map((a) => ({ sport: "", minutes: Math.round((a.duration_s ?? 0) / 60), hardMinutes: 0, hard: false }));
    const level = LEVELS[Math.max(LEVELS.indexOf(fuelDay(planned)), LEVELS.indexOf(done.length ? fuelDay(done) : "low"))];
    days.push({
      date,
      level,
      meals: (meals ?? []).filter((m) => m.local_date === date).map((m) => ({ hour: localHour(m.eaten_at, tz), kcal: Number(m.kcal), carbs: Number(m.carbs_g) })),
    });
  }

  const weekAgo = Date.now() - 7 * DAY;
  const hours = (list: typeof acts) => (list ?? []).reduce((t, a) => t + (a.duration_s ?? 0), 0) / 3600;
  const recent = (acts ?? []).filter((a) => new Date(a.start_time).getTime() >= weekAgo);
  const prior = (acts ?? []).filter((a) => {
    const t = new Date(a.start_time).getTime();
    return t < weekAgo && t >= weekAgo - 28 * DAY;
  });

  const result = evaluateSafety({
    weightKg: Number(body.weight_kg),
    days,
    load: { last7Hours: hours(recent), prior28Hours: hours(prior) },
    readiness: (readiness ?? []).map((r) => r.overall as string),
    feels: (checkins ?? []).map((c) => Number(c.feel)),
  });
  if (!result) return "clear";

  // An open note from the last week: refresh it quietly instead of adding another.
  const { data: latest } = await admin
    .from("safety_notes")
    .select("id, status, signal_count, signals, decided_at, created_on")
    .eq("athlete_id", athlete.id)
    .eq("coach_id", coachId)
    .order("created_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.status === "open" && latest.created_on >= addDays(today, -7)) {
    await admin.from("safety_notes").update({ signals: result.signals, signal_count: result.count, summary: result.summary, updated_on: today }).eq("id", latest.id);
    return "updated";
  }
  if (latest && latest.status !== "open" && latest.decided_at) {
    const prev = { count: latest.signal_count, lowDays: Number((latest.signals as { intake?: { lowDays?: number } })?.intake?.lowDays ?? 0), decidedDaysAgo: (Date.now() - new Date(latest.decided_at).getTime()) / DAY };
    if (!shouldNotifyAgain(prev, result)) return "quiet";
  }

  const { data: note, error } = await admin
    .from("safety_notes")
    .upsert(
      { coach_id: coachId, athlete_id: athlete.id, created_on: today, updated_on: today, signals: result.signals, signal_count: result.count, summary: result.summary, status: "open", decided_at: null },
      { onConflict: "athlete_id,created_on" },
    )
    .select("id")
    .single();
  if (error || !note) return "error";
  await admin.rpc("notify_safety_note", { p_note: note.id });
  return "noted";
}

/** Checks every real athlete of this coach (including the coach, when they're on their own roster). */
export async function runSafetyNet(coachId: string) {
  const admin = createAdminClient();
  const { data: athletes } = await admin.from("profiles").select("id, timezone").eq("coach_id", coachId).eq("is_test", false);
  const out: Record<string, string> = {};
  for (const a of athletes ?? []) out[a.id] = await checkAthlete(admin, coachId, a).catch(() => "error");
  return out;
}
