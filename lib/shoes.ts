import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { bikeMileage, INDOOR_RIDE, shoeMileage, type BikeTotals, type Closet } from "@/lib/closet";

const RUN_FILTER = "sport.ilike.%run%,sport.ilike.%treadmill%,sport.ilike.%trail%,sport.ilike.%track%";

/**
 * Meters on each of an athlete's shoes. Reads runs since the oldest pair's `since` (two years when
 * unknown) plus the per-run shoe picks. Works with the viewer's client (RLS) or the service role.
 */
export async function getShoeMileage(supabase: SupabaseClient, athleteId: string, closet: Closet, timeZone: string): Promise<Record<string, number>> {
  if (!closet.shoes.length) return {};
  const dates = closet.shoes.map((s) => s.since);
  const from = dates.some((d) => !d) ? new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10) : dates.sort()[0]!;
  const [{ data: runs }, { data: picks }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, start_time, distance_m")
      .eq("athlete_id", athleteId)
      .or(RUN_FILTER)
      .gte("start_time", new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString())
      .limit(2000),
    supabase.from("activity_shoes").select("activity_id, shoe_id").eq("athlete_id", athleteId),
  ]);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone });
  return shoeMileage(
    closet,
    (runs ?? []).map((r) => ({ id: r.id, date: day.format(new Date(r.start_time)), distance_m: r.distance_m === null ? null : Number(r.distance_m) })),
    Object.fromEntries((picks ?? []).map((p) => [p.activity_id, p.shoe_id])),
  );
}

const RIDE_FILTER = "sport.ilike.%cycl%,sport.ilike.%bik%,sport.ilike.%ride%";

/** Distance and rides on each bike, over the last two years. Viewer's client (RLS) or the service role. */
export async function getBikeMileage(supabase: SupabaseClient, athleteId: string, closet: Closet, timeZone: string): Promise<BikeTotals> {
  if (!closet.bikes.length) return {};
  const [{ data: rides }, { data: picks }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, sport, start_time, distance_m")
      .eq("athlete_id", athleteId)
      .or(RIDE_FILTER)
      .gte("start_time", new Date(Date.now() - 730 * 86_400_000).toISOString())
      .limit(2000),
    supabase.from("activity_bikes").select("activity_id, bike_id").eq("athlete_id", athleteId),
  ]);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone });
  return bikeMileage(
    closet,
    (rides ?? []).map((r) => ({ id: r.id, date: day.format(new Date(r.start_time)), distance_m: r.distance_m === null ? null : Number(r.distance_m), indoor: INDOOR_RIDE.test(r.sport ?? "") })),
    Object.fromEntries((picks ?? []).map((p) => [p.activity_id, p.bike_id])),
  );
}
