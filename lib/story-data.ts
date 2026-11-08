import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanCloset, shoeMileage } from "@/lib/closet";
import { buildStory, type Story } from "@/lib/story";

const RUN = /run|treadmill|trail|track/i;

/**
 * An athlete's story for local dates [from, to). Works with the viewer's client (their own data
 * under RLS) or the service role (the monthly recap job). Also returns the pair of shoes with the
 * most distance in the period, when they track shoes.
 */
export async function loadStory(
  supabase: SupabaseClient,
  athleteId: string,
  from: string,
  to: string,
  timeZone: string,
): Promise<Story & { topShoe: { model: string; m: number } | null }> {
  const pad = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone });
  const inRange = (iso: string) => {
    const d = day.format(new Date(iso));
    return d >= from && d < to;
  };
  const today = day.format(new Date());
  const [{ data: acts }, { data: prs }, { count: races }, { data: ready }, { data: gearRow }, { data: picks }] = await Promise.all([
    supabase.from("activities").select("id, sport, start_time, duration_s, distance_m").eq("athlete_id", athleteId).gte("start_time", pad(from, -1)).lt("start_time", pad(to, 1)).limit(3000),
    supabase.from("achievements").select("achieved_at").eq("athlete_id", athleteId).like("key", "pr_%").gte("achieved_at", pad(from, -1)).lt("achieved_at", pad(to, 1)),
    supabase.from("races").select("id", { count: "exact", head: true }).eq("athlete_id", athleteId).gte("race_date", from).lt("race_date", to).lte("race_date", today),
    supabase.from("readiness_scores").select("overall").eq("athlete_id", athleteId).gte("date", from).lt("date", to),
    supabase.from("athlete_gear").select("gear").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("activity_shoes").select("activity_id, shoe_id").eq("athlete_id", athleteId).gte("created_at", pad(from, -1)),
  ]);
  const list = (acts ?? []).filter((a) => inRange(a.start_time));
  const story = buildStory({
    activities: list,
    prs: (prs ?? []).filter((p) => inRange(p.achieved_at)).length,
    races: races ?? 0,
    readiness: (ready ?? []).map((r) => r.overall as string),
  });

  // Shoes: distance per pair from this period's runs only (no starting miles).
  const closet = cleanCloset(gearRow?.gear);
  let topShoe: { model: string; m: number } | null = null;
  if (closet.shoes.length) {
    const fresh = { ...closet, shoes: closet.shoes.map((s) => ({ ...s, start_m: 0 })) };
    const runs = list.filter((a) => RUN.test(a.sport ?? "")).map((a) => ({ id: a.id, date: day.format(new Date(a.start_time)), distance_m: a.distance_m === null ? null : Number(a.distance_m) }));
    const miles = shoeMileage(fresh, runs, Object.fromEntries((picks ?? []).map((p) => [p.activity_id, p.shoe_id])));
    const best = closet.shoes.map((s) => ({ model: s.model, m: miles[s.id] ?? 0 })).sort((a, b) => b.m - a.m)[0];
    if (best && best.m >= 5000) topShoe = best;
  }
  return { ...story, topShoe };
}
