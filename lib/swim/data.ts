import type { SupabaseClient } from "@supabase/supabase-js";

import type { Lap, Streams } from "@/lib/activity/fit";
import { isSwim, swimPool, swimSummary } from "@/lib/activity/swim";

import { DRILLS, fadeOf, suggestDrills, swimMetrics, trendOf, type DrillKey, type Fade, type Suggestion, type SwimMetrics, type Trend } from "./insights";

const DAY = 86_400_000;

export type SwimView = {
  metrics: SwimMetrics[]; // oldest first
  lastFade: Fade | null;
  trends: { dps: Trend | null; swolf25: Trend | null; pace100: Trend | null };
  suggestions: Suggestion[]; // not yet approved or dismissed
  focus: { key: DrillKey; name: string; set: string }[];
  note: string | null;
  videoAsked: boolean;
  yards: boolean; // show per-yard numbers (athlete uses miles)
};

/** Pool swims from the last 12 weeks, analysed. Null when there's nothing to show. Caller's client; RLS applies. */
export async function getSwimView(supabase: SupabaseClient, athleteId: string, yd = false): Promise<SwimView | null> {
  const [{ data: acts }, { data: coaching }] = await Promise.all([
    supabase.from("activities").select("id, sport, start_time, distance_m").eq("athlete_id", athleteId).ilike("sport", "%swim%").gte("start_time", new Date(Date.now() - 84 * DAY).toISOString()).order("start_time").limit(120),
    supabase.from("swim_coaching").select("focus, dismissed, note, video_asked").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const swims = (acts ?? []).filter((a) => isSwim(a.sport) && !/open_water/i.test(a.sport ?? ""));
  const focusKeys = ((coaching?.focus ?? []) as string[]).filter((k): k is DrillKey => k in DRILLS);
  if (!swims.length && !focusKeys.length) return null;
  const { data: details } = swims.length ? await supabase.from("activity_details").select("activity_id, laps, pool:streams->pool").in("activity_id", swims.map((s) => s.id)) : { data: [] };
  const byId = new Map((details ?? []).map((d) => [d.activity_id as string, d]));
  const metrics: SwimMetrics[] = [];
  const fades: (Fade | null)[] = [];
  for (const s of swims) {
    const d = byId.get(s.id);
    const laps = (d?.laps ?? []) as Lap[];
    if (!laps.length) continue;
    const pool = swimPool(d?.pool ? ({ pool: d.pool } as unknown as Streams) : null, laps, s.distance_m, "km");
    const sum = swimSummary(laps, pool.unit, pool);
    if (!sum) continue;
    const m = swimMetrics(sum, { date: String(s.start_time).slice(0, 10), activity_id: s.id });
    if (!m) continue;
    metrics.push(m);
    fades.push(fadeOf(sum, yd));
  }
  const dismissed = (coaching?.dismissed ?? {}) as Record<string, string>;
  const suggestions = suggestDrills(metrics, fades, yd).filter((s) => !focusKeys.includes(s.key) && !dismissed[s.key]);
  if (!metrics.length && !focusKeys.length) return null;
  return {
    metrics,
    lastFade: fades.at(-1) ?? null,
    trends: { dps: trendOf(metrics, "dps"), swolf25: trendOf(metrics, "swolf25"), pace100: trendOf(metrics, "pace100") },
    suggestions,
    focus: focusKeys.map((k) => ({ key: k, ...DRILLS[k] })),
    note: coaching?.note ?? null,
    videoAsked: Boolean(coaching?.video_asked),
    yards: yd,
  };
}
