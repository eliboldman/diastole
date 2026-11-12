import "server-only";

import { sealed, sealedTitle, titleFor } from "@/lib/workouts/mystery";
import { localDate } from "@/lib/readiness/run";
import type { Profile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, Step } from "@/lib/workouts/garmin-format";
import { rideMassKg, rideSeconds, toRideCourses, toRideSteps, type RideCourse, type RidePlan } from "@/lib/workouts/ride";
import { estimateSession } from "@/lib/fuel/plan";
import { watchFuel, type WatchFuel } from "@/lib/fuel/watch";

// What the Garmin watch app (and the Apple TV home screen) shows: today's plan, readiness and last
// night's numbers. Keys are short and lists capped because a Connect IQ background task can hand
// at most ~8 KB to the watch app (2 workouts × 10 lines × 72 chars stays well under).

type Admin = ReturnType<typeof createAdminClient>;

export type TodayWorkout = { id: string; t: string; s: string; why?: string; l: string[]; min?: number; f?: WatchFuel };
/** A finished session waiting for its check-in. q: ask about fuel. */
export type PendingCheckin = { a: string; t: string; s: string; min: number; q: 0 | 1 };
export type TodayPayload = {
  v: 1;
  d: string; // athlete's local date
  n: string | null; // first name
  r: { o: "green" | "yellow" | "red"; t?: string } | null;
  w: TodayWorkout[];
  nx: { t: string; s: string; d: string }[]; // tomorrow
  m: { hrv?: number; rhr?: number; sl?: number; ss?: number; bb?: number; st?: number };
  ck?: PendingCheckin;
  u: number; // unix seconds when built
};

const SPORT_SHORT: Record<string, string> = { run: "run", bike: "bike", swim: "swim", strength: "strength" };
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function minutes(steps: Step[]): number | undefined {
  const sec = rideSeconds(toRideSteps(steps));
  return sec > 0 ? Math.round(sec / 60) : undefined;
}

export async function buildToday(profile: Profile, admin: Admin = createAdminClient()): Promise<TodayPayload> {
  const tz = profile.timezone || "America/Los_Angeles";
  const now = new Date();
  const today = localDate(now, tz);
  const tomorrow = localDate(new Date(now.getTime() + 86_400_000), tz);

  const [workouts, readiness, wellness, recent] = await Promise.all([
    admin
      .from("planned_workouts")
      .select("id, scheduled_date, title, sport, steps, why, pool_length, pool_unit, mystery, revealed_at")
      .eq("athlete_id", profile.id)
      .in("scheduled_date", [today, tomorrow])
      .in("status", ["approved", "sent", "completed"])
      .is("deleted_at", null)
      .order("created_at"),
    admin.from("readiness_scores").select("date, overall, note").eq("athlete_id", profile.id).in("date", [today, localDate(new Date(now.getTime() - 86_400_000), tz)]).order("date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds, sleep_score, body_battery_high, stress_avg").eq("athlete_id", profile.id).lte("date", today).order("date", { ascending: false }).limit(3),
    admin
      .from("activities")
      .select("id, name, sport, duration_s, start_time, planned_workout_id, workout_checkins(activity_id)")
      .eq("athlete_id", profile.id)
      .gte("start_time", new Date(now.getTime() - 18 * 3_600_000).toISOString())
      .gte("duration_s", 600)
      .order("start_time", { ascending: false })
      .limit(5),
  ]);

  const rows = workouts.data ?? [];
  const w: TodayWorkout[] = rows
    .filter((r) => r.scheduled_date === today)
    .slice(0, 2)
    .map((r) => {
      const steps = (r.steps ?? []) as Step[];
      const pool: Pool = r.pool_length ? { length: Number(r.pool_length), unit: r.pool_unit === "YARD" ? "YARD" : "METER" } : null;
      const lines = describe(steps, profile.units ?? "mi", pool, r.sport === "swim").filter(Boolean).slice(0, 10).map((l) => cut(l, 72));
      const hide = sealed(r);
      // Mystery: the watch shows it sealed; Garmin's own player reveals each step as it starts.
      const out: TodayWorkout = { id: r.id, t: cut(hide ? sealedTitle(r) : r.title, 40), s: SPORT_SHORT[r.sport] ?? r.sport, l: hide ? ["Sealed by your coach.", "Each step shows as it starts.", "Reveal early in the app."] : lines };
      if (r.why && !hide) out.why = cut(r.why, 160);
      const min = minutes(steps);
      if (min) out.min = min;
      const est = estimateSession(steps, r.sport, null, pool);
      const f = watchFuel(est.minutes ?? min, { hard: est.hard, swim: r.sport === "swim" });
      if (f) out.f = f;
      return out;
    });

  // Newest value of each number from the last few days (sources fill different fields).
  const m: TodayPayload["m"] = {};
  for (const row of wellness.data ?? []) {
    m.hrv ??= row.hrv_ms != null ? Math.round(Number(row.hrv_ms)) : undefined;
    m.rhr ??= row.resting_hr != null ? Math.round(Number(row.resting_hr)) : undefined;
    m.sl ??= row.sleep_seconds != null && row.date === today ? Math.round(row.sleep_seconds / 60) : undefined;
    m.ss ??= row.sleep_score != null && row.date === today ? row.sleep_score : undefined;
    m.bb ??= row.body_battery_high ?? undefined;
    m.st ??= row.stress_avg ?? undefined;
  }
  for (const k of Object.keys(m) as (keyof typeof m)[]) if (m[k] === undefined) delete m[k];

  // The newest finished session without a check-in (from the app or the watch).
  const open = (recent.data ?? []).find((a) => !(Array.isArray(a.workout_checkins) ? a.workout_checkins.length : a.workout_checkins));
  let ck: PendingCheckin | undefined;
  if (open) {
    const mins = Math.round((open.duration_s ?? 0) / 60);
    const sport = String(open.sport ?? "");
    const short = /run/i.test(sport) ? "run" : /cycl|bik|ride/i.test(sport) ? "bike" : /swim/i.test(sport) ? "swim" : /strength/i.test(sport) ? "strength" : "workout";
    ck = { a: open.id, t: cut(String(open.name || "Workout"), 40), s: short, min: mins, q: watchFuel(mins, { swim: short === "swim" }) ? 1 : 0 };
  }

  const flag = readiness.data?.overall;
  return {
    v: 1,
    d: today,
    n: profile.full_name?.split(" ")[0] ?? null,
    r: flag && flag !== "unknown" ? { o: flag, ...(readiness.data?.note ? { t: cut(readiness.data.note, 120) } : {}) } : null,
    w,
    nx: rows.filter((r) => r.scheduled_date === tomorrow).slice(0, 2).map((r) => ({ t: cut(titleFor(r), 40), s: SPORT_SHORT[r.sport] ?? r.sport, d: r.scheduled_date })),
    m,
    ...(ck ? { ck } : {}),
    u: Math.floor(now.getTime() / 1000),
  };
}

/** For the fueling data field: today's sessions with their reminder timings. */
export async function buildFuel(profile: Profile, admin: Admin = createAdminClient()): Promise<{ v: 1; d: string; w: { s: string; min?: number; f?: WatchFuel }[]; u: number }> {
  const tz = profile.timezone || "America/Los_Angeles";
  const today = localDate(new Date(), tz);
  const { data } = await admin
    .from("planned_workouts")
    .select("sport, steps, pool_length, pool_unit")
    .eq("athlete_id", profile.id)
    .eq("scheduled_date", today)
    .in("status", ["approved", "sent", "completed"])
    .is("deleted_at", null)
    .order("created_at")
    .limit(4);
  const w = (data ?? []).map((r) => {
    const steps = (r.steps ?? []) as Step[];
    const pool: Pool = r.pool_length ? { length: Number(r.pool_length), unit: r.pool_unit === "YARD" ? "YARD" : "METER" } : null;
    const est = estimateSession(steps, r.sport, null, pool);
    const min = est.minutes ?? minutes(steps);
    const f = watchFuel(min, { hard: est.hard, swim: r.sport === "swim" });
    return { s: SPORT_SHORT[r.sport] ?? r.sport, ...(min ? { min } : {}), ...(f ? { f } : {}) };
  });
  return { v: 1, d: today, w, u: Math.floor(Date.now() / 1000) };
}

/** Bike workouts the trainer apps can ride: today first, then the next few days, plus the FTP. */
export async function buildRides(profile: Profile, opts: { id?: string } = {}, admin: Admin = createAdminClient()): Promise<{ ftp: number | null; units: "mi" | "km"; rides: RidePlan[]; courses: RideCourse[]; mass_kg: number }> {
  const tz = profile.timezone || "America/Los_Angeles";
  const today = localDate(new Date(), tz);
  const until = localDate(new Date(Date.now() + 6 * 86_400_000), tz);
  let q = admin
    .from("planned_workouts")
    .select("id, scheduled_date, title, why, steps, mystery, revealed_at, sport")
    .eq("athlete_id", profile.id)
    .eq("sport", "bike")
    .in("status", ["approved", "sent", "completed"])
    .is("deleted_at", null);
  q = opts.id ? q.eq("id", opts.id) : q.gte("scheduled_date", localDate(new Date(Date.now() - 86_400_000), tz)).lte("scheduled_date", until);
  const [{ data }, { data: zones }, { data: raceRows }, { data: body }] = await Promise.all([
    q.order("scheduled_date").limit(10),
    admin.from("athlete_zones").select("ftp_w").eq("athlete_id", profile.id).maybeSingle(),
    // Bike courses from the athlete's races (upcoming, or within the last 90 days) to ride on the trainer.
    admin.from("races").select("id, name, race_date, course_name, course_leg, course").eq("athlete_id", profile.id).eq("course_leg", "bike").not("course", "is", null).gte("race_date", localDate(new Date(Date.now() - 90 * 86_400_000), tz)).order("race_date").limit(10),
    admin.from("athlete_body").select("weight_kg").eq("athlete_id", profile.id).maybeSingle(),
  ]);
  const ftp = zones?.ftp_w ?? null;
  const rides = (data ?? [])
    .map((r) => {
      const hide = sealed(r);
      return { id: r.id, date: r.scheduled_date, title: hide ? sealedTitle(r) : r.title, why: hide ? null : (r.why ?? null), ftp, steps: toRideSteps((r.steps ?? []) as Step[]), ...(hide ? { mystery: true } : {}) };
    })
    .filter((r) => r.steps.length)
    // Today first, then upcoming, then yesterday (a missed ride).
    .sort((a, b) => rank(a.date, today) - rank(b.date, today) || a.date.localeCompare(b.date));
  return { ftp, units: profile.units ?? "mi", rides, courses: toRideCourses(raceRows ?? []), mass_kg: rideMassKg(body?.weight_kg ? Number(body.weight_kg) : null) };
}

const rank = (d: string, today: string) => (d === today ? 0 : d > today ? 1 : 2);
