import "server-only";

import { localDate } from "@/lib/readiness/run";
import type { Profile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, Step } from "@/lib/workouts/garmin-format";
import { rideSeconds, toRideSteps, type RidePlan } from "@/lib/workouts/ride";

// What the Garmin watch app (and the Apple TV home screen) shows: today's plan, readiness and last
// night's numbers. Keys are short and lists capped because a Connect IQ background task can hand
// at most ~8 KB to the watch app (2 workouts × 10 lines × 72 chars stays well under).

type Admin = ReturnType<typeof createAdminClient>;

export type TodayWorkout = { id: string; t: string; s: string; why?: string; l: string[]; min?: number };
export type TodayPayload = {
  v: 1;
  d: string; // athlete's local date
  n: string | null; // first name
  r: { o: "green" | "yellow" | "red"; t?: string } | null;
  w: TodayWorkout[];
  nx: { t: string; s: string; d: string }[]; // tomorrow
  m: { hrv?: number; rhr?: number; sl?: number; ss?: number; bb?: number; st?: number };
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

  const [workouts, readiness, wellness] = await Promise.all([
    admin
      .from("planned_workouts")
      .select("id, scheduled_date, title, sport, steps, why, pool_length, pool_unit")
      .eq("athlete_id", profile.id)
      .in("scheduled_date", [today, tomorrow])
      .in("status", ["approved", "sent", "completed"])
      .is("deleted_at", null)
      .order("created_at"),
    admin.from("readiness_scores").select("date, overall, note").eq("athlete_id", profile.id).in("date", [today, localDate(new Date(now.getTime() - 86_400_000), tz)]).order("date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("daily_wellness").select("date, hrv_ms, resting_hr, sleep_seconds, sleep_score, body_battery_high, stress_avg").eq("athlete_id", profile.id).lte("date", today).order("date", { ascending: false }).limit(3),
  ]);

  const rows = workouts.data ?? [];
  const w: TodayWorkout[] = rows
    .filter((r) => r.scheduled_date === today)
    .slice(0, 2)
    .map((r) => {
      const steps = (r.steps ?? []) as Step[];
      const pool: Pool = r.pool_length ? { length: Number(r.pool_length), unit: r.pool_unit === "YARD" ? "YARD" : "METER" } : null;
      const lines = describe(steps, profile.units ?? "mi", pool, r.sport === "swim").filter(Boolean).slice(0, 10).map((l) => cut(l, 72));
      const out: TodayWorkout = { id: r.id, t: cut(r.title, 40), s: SPORT_SHORT[r.sport] ?? r.sport, l: lines };
      if (r.why) out.why = cut(r.why, 160);
      const min = minutes(steps);
      if (min) out.min = min;
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

  const flag = readiness.data?.overall;
  return {
    v: 1,
    d: today,
    n: profile.full_name?.split(" ")[0] ?? null,
    r: flag && flag !== "unknown" ? { o: flag, ...(readiness.data?.note ? { t: cut(readiness.data.note, 120) } : {}) } : null,
    w,
    nx: rows.filter((r) => r.scheduled_date === tomorrow).slice(0, 2).map((r) => ({ t: cut(r.title, 40), s: SPORT_SHORT[r.sport] ?? r.sport, d: r.scheduled_date })),
    m,
    u: Math.floor(now.getTime() / 1000),
  };
}

/** Bike workouts the trainer apps can ride: today first, then the next few days, plus the FTP. */
export async function buildRides(profile: Profile, opts: { id?: string } = {}, admin: Admin = createAdminClient()): Promise<{ ftp: number | null; units: "mi" | "km"; rides: RidePlan[] }> {
  const tz = profile.timezone || "America/Los_Angeles";
  const today = localDate(new Date(), tz);
  const until = localDate(new Date(Date.now() + 6 * 86_400_000), tz);
  let q = admin
    .from("planned_workouts")
    .select("id, scheduled_date, title, why, steps")
    .eq("athlete_id", profile.id)
    .eq("sport", "bike")
    .in("status", ["approved", "sent", "completed"])
    .is("deleted_at", null);
  q = opts.id ? q.eq("id", opts.id) : q.gte("scheduled_date", localDate(new Date(Date.now() - 86_400_000), tz)).lte("scheduled_date", until);
  const [{ data }, { data: zones }] = await Promise.all([q.order("scheduled_date").limit(10), admin.from("athlete_zones").select("ftp_w").eq("athlete_id", profile.id).maybeSingle()]);
  const ftp = zones?.ftp_w ?? null;
  const rides = (data ?? [])
    .map((r) => ({ id: r.id, date: r.scheduled_date, title: r.title, why: r.why ?? null, ftp, steps: toRideSteps((r.steps ?? []) as Step[]) }))
    .filter((r) => r.steps.length)
    // Today first, then upcoming, then yesterday (a missed ride).
    .sort((a, b) => rank(a.date, today) - rank(b.date, today) || a.date.localeCompare(b.date));
  return { ftp, units: profile.units ?? "mi", rides };
}

const rank = (d: string, today: string) => (d === today ? 0 : d > today ? 1 : 2);
