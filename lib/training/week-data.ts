import type { SupabaseClient } from "@supabase/supabase-js";

import { compareWorkout, complianceOf, type Compliance } from "@/lib/activity/compare";
import type { Lap } from "@/lib/activity/fit";
import { daysBackIso, estimateMaxHr } from "@/lib/activity/zones";
import { inferPool, type Brick, type PoolUnit, type Step } from "@/lib/workouts/garmin-format";

import { addDays, mondayOf, weekReview, type WeekReview } from "./week";

export type WeekWithCompliance = WeekReview & { compliance: Record<string, Compliance | null>; today: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The Monday a `?week=` value points at (any date in that week), or this week's. */
export function weekStartFrom(param: string | undefined, today: string) {
  return mondayOf(param && DATE.test(param) ? param : today);
}

/**
 * One athlete's week, planned vs done, with each matched session's on-target score from its laps.
 * Uses the caller's client, so row-level security decides what can be read (athlete or coach).
 */
export async function getWeek(supabase: SupabaseClient, athleteId: string, tz: string, start: string): Promise<WeekWithCompliance> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const end = addDays(start, 6);
  // Activities by the athlete's local day: pad a day either side, then filter by local date.
  const from = new Date(Date.parse(`${addDays(start, -1)}T00:00:00Z`)).toISOString();
  const to = new Date(Date.parse(`${addDays(end, 2)}T00:00:00Z`)).toISOString();

  const [{ data: plans }, { data: acts }, { data: zones }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("id, scheduled_date, sport, title, steps, pool_length, pool_unit, brick")
      .eq("athlete_id", athleteId)
      .neq("status", "draft")
      .is("deleted_at", null)
      .gte("scheduled_date", start)
      .lte("scheduled_date", end),
    supabase
      .from("activities")
      .select("id, start_time, sport, duration_s, distance_m, planned_workout_id")
      .eq("athlete_id", athleteId)
      .gte("start_time", from)
      .lt("start_time", to)
      .order("start_time"),
    supabase.from("athlete_zones").select("max_hr, threshold_speed_mps, ftp_w").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  const review = weekReview({
    start,
    today,
    tz,
    zones,
    plans: (plans ?? []).map((p) => {
      const saved = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
      return { id: p.id, date: p.scheduled_date, sport: p.sport, title: p.title, steps: (p.steps ?? []) as Step[], pool: p.sport === "swim" ? inferPool((p.steps ?? []) as Step[], saved) : saved, brick: (p.brick ?? null) as Brick };
    }),
    activities: acts ?? [],
  });

  // On-target scores need the laps of each matched activity, and max HR for zone targets.
  const matched = review.sessions.filter((s) => s.activity);
  const compliance: Record<string, Compliance | null> = {};
  if (matched.length) {
    let maxHr = zones?.max_hr ?? null;
    const needsHr = matched.some((s) => JSON.stringify(s.plan.steps).includes('"hr_zone"'));
    const [{ data: details }, recent] = await Promise.all([
      supabase.from("activity_details").select("activity_id, laps").in("activity_id", matched.map((s) => s.activity!.id)),
      !maxHr && needsHr
        ? supabase.from("activities").select("max_hr").eq("athlete_id", athleteId).gte("start_time", daysBackIso(180)).not("max_hr", "is", null).limit(500)
        : Promise.resolve({ data: null }),
    ]);
    if (!maxHr && recent.data) maxHr = estimateMaxHr(recent.data.map((r) => r.max_hr));
    const lapsBy = new Map((details ?? []).map((d) => [d.activity_id as string, ((d.laps ?? []) as Lap[]).filter((l) => (l.duration_s ?? 0) > 0)]));
    for (const s of matched) {
      const laps = lapsBy.get(s.activity!.id);
      compliance[s.plan.id] = laps?.length ? complianceOf(compareWorkout(s.plan.steps, laps, maxHr, s.plan.pool)) : null;
    }
  }
  return { ...review, compliance, today };
}
