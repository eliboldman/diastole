import "server-only";

import { asFuelMode, estimateSession, fuelDay, type FuelDay, type FuelMode, type Session } from "@/lib/fuel/plan";
import { createClient } from "@/lib/supabase/server";
import type { Pool, PoolUnit, Step } from "@/lib/workouts/garmin-format";

export type FuelWorkout = { id: string; title: string; sport: string; session: Session };
export type FuelDayView = { date: string; level: FuelDay; race: boolean; workouts: FuelWorkout[] };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The athlete's fueling mode (set by their coach; plate pictures when unset). Row-level security applies. */
export async function getFuelMode(athleteId: string): Promise<FuelMode> {
  const supabase = await createClient();
  const { data } = await supabase.from("fuel_settings").select("mode").eq("athlete_id", athleteId).maybeSingle();
  return asFuelMode(data?.mode);
}

/** Planned sessions and fuel levels for `days` days from `from` (the athlete's local date). */
export async function getFuelDays(athleteId: string, from: string, days = 7): Promise<FuelDayView[]> {
  const supabase = await createClient();
  const to = addDays(from, days - 1);
  const [{ data: plans }, { data: zones }, { data: goal }] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("id, scheduled_date, title, sport, steps, pool_length, pool_unit, created_at")
      .eq("athlete_id", athleteId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date")
      .order("created_at"),
    supabase.from("athlete_zones").select("threshold_speed_mps, ftp_w").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_goals").select("race_date").eq("athlete_id", athleteId).maybeSingle(),
  ]);

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const workouts = (plans ?? [])
      .filter((p) => p.scheduled_date === date)
      .map((p) => {
        const pool: Pool = p.pool_length && p.pool_unit ? { length: Number(p.pool_length), unit: p.pool_unit as PoolUnit } : null;
        return { id: p.id, title: p.title, sport: p.sport, session: estimateSession((p.steps ?? []) as Step[], p.sport, zones, pool) };
      });
    const race = goal?.race_date === date;
    return { date, level: fuelDay(workouts.map((w) => w.session), race), race, workouts };
  });
}
