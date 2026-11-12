import "server-only";

import { gutMax, raceMinutes, racePlan, type RacePlan, type RaceSport } from "@/lib/fuel/race";
import { createClient } from "@/lib/supabase/server";

export type RaceRow = {
  id: string;
  athlete_id: string;
  name: string;
  race_date: string;
  sport: RaceSport;
  distance_km: number | null;
  goal_seconds: number | null;
  priority: "A" | "B" | "C";
  created_at?: string;
  poster_kept?: boolean;
  notes: string | null;
  checklist: Record<string, boolean>;
  pack?: unknown; // packing list state (lib/pack)
};
export type SweatRow = { id: string; tested_on: string; sweat_rate_ml_h: number; minutes: number; temp_c: number | null; sport: string | null };
export type GutRow = { id: string; on_date: string; carbs_g_per_h: number; minutes: number | null; comfort: number; products: string | null; note: string | null };

const RACE_COLS = "id, athlete_id, name, race_date, sport, distance_km, goal_seconds, priority, notes, checklist, pack, created_at, poster_kept";

/** An athlete's races (row-level security: themself or their coach), soonest first. */
export async function getRaces(athleteId: string, opts: { from?: string; limit?: number } = {}): Promise<RaceRow[]> {
  const supabase = await createClient();
  let q = supabase.from("races").select(RACE_COLS).eq("athlete_id", athleteId).order("race_date");
  if (opts.from) q = q.gte("race_date", opts.from);
  const { data } = await q.limit(opts.limit ?? 50);
  return (data ?? []) as RaceRow[];
}

export async function getRace(id: string): Promise<RaceRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("races").select(RACE_COLS).eq("id", id).maybeSingle();
  return (data as RaceRow | null) ?? null;
}

/** Everything the race plan is sized from: weight, latest sweat rate, gut-trained carbs. */
export async function getRaceTools(athleteId: string) {
  const supabase = await createClient();
  const [{ data: body }, { data: sweat }, { data: gut }] = await Promise.all([
    supabase.from("athlete_body").select("weight_kg").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("sweat_tests").select("id, tested_on, sweat_rate_ml_h, minutes, temp_c, sport").eq("athlete_id", athleteId).order("tested_on", { ascending: false }).limit(10),
    supabase.from("gut_sessions").select("id, on_date, carbs_g_per_h, minutes, comfort, products, note").eq("athlete_id", athleteId).order("on_date", { ascending: false }).limit(30),
  ]);
  const sweats = (sweat ?? []) as SweatRow[];
  const guts = (gut ?? []) as GutRow[];
  // A few recent tests average out day-to-day noise.
  const recent = sweats.slice(0, 3).map((s) => s.sweat_rate_ml_h);
  return {
    weightKg: body?.weight_kg ? Number(body.weight_kg) : null,
    sweatRateMlH: recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null,
    gutMaxCarbs: gutMax(guts),
    sweats,
    guts,
  };
}

export function planFor(race: RaceRow, tools: Awaited<ReturnType<typeof getRaceTools>>): RacePlan | null {
  const minutes = raceMinutes(race);
  return minutes ? racePlan({ minutes, sport: race.sport, weightKg: tools.weightKg, sweatRateMlH: tools.sweatRateMlH, gutMaxCarbs: tools.gutMaxCarbs }) : null;
}
