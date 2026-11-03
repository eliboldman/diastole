import "server-only";

import type { Flag } from "@/lib/readiness/engine";
import { localDate, refreshReadiness } from "@/lib/readiness/run";
import { createClient } from "@/lib/supabase/server";

export type ReadinessRow = {
  date: string;
  overall: Flag;
  recovery: Flag;
  sleep: Flag;
  stress: Flag;
  load: Flag;
  note: string;
  details: Record<string, unknown> | null;
};

export type WellnessPoint = {
  date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_seconds: number | null;
  stress_avg: number | null;
};

export type ActivityRow = {
  id: string;
  sport: string | null;
  start_time: string;
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
};

export type AthleteSummary = {
  id: string;
  name: string;
  email: string | null;
  timezone: string;
  isCoach: boolean;
  device: { source: "garmin" | "apple"; last_synced_at: string | null } | null;
  readiness: ReadinessRow | null;
  trend: WellnessPoint[];
  lastActivity: ActivityRow | null;
};

const TREND_DAYS = 14;

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}

/** Every athlete on this coach's roster, with today's readiness and a 14-day trend. */
export async function getRoster(coachId: string): Promise<AthleteSummary[]> {
  const supabase = await createClient(); // row-level security limits this to the coach's own athletes

  const { data: athletes } = await supabase
    .from("profiles")
    .select("id, full_name, email, timezone")
    .eq("coach_id", coachId)
    .order("full_name");
  if (!athletes?.length) return [];

  const ids = athletes.map((a) => a.id);

  // Make sure each athlete has a readiness row for their local today (cheap at this roster size).
  const { data: existing } = await supabase
    .from("readiness_scores")
    .select("athlete_id, date")
    .in("athlete_id", ids)
    .gte("date", daysAgo(2));
  const have = new Set((existing ?? []).map((r) => `${r.athlete_id}:${r.date}`));
  await Promise.all(
    athletes
      .filter((a) => !have.has(`${a.id}:${localDate(new Date(), a.timezone)}`))
      .map((a) => refreshReadiness(a.id).catch((e) => console.error("readiness refresh", a.id, e))),
  );

  const [{ data: readiness }, { data: wellness }, { data: connections }, { data: activities }] = await Promise.all([
    supabase
      .from("readiness_scores")
      .select("athlete_id, date, overall, recovery, sleep, stress, load, note, details")
      .in("athlete_id", ids)
      .gte("date", daysAgo(3))
      .order("date", { ascending: false }),
    supabase
      .from("daily_wellness")
      .select("athlete_id, date, source, hrv_ms, resting_hr, sleep_seconds, stress_avg")
      .in("athlete_id", ids)
      .gte("date", daysAgo(TREND_DAYS))
      .order("date"),
    supabase.from("device_connections").select("athlete_id, source, last_synced_at").in("athlete_id", ids),
    supabase
      .from("activities")
      .select("id, athlete_id, sport, start_time, duration_s, distance_m, avg_hr")
      .in("athlete_id", ids)
      .gte("start_time", daysAgo(30))
      .order("start_time", { ascending: false }),
  ]);

  return athletes.map((a) => {
    const device = connections?.find((c) => c.athlete_id === a.id) ?? null;
    const source = device?.source ?? "garmin";
    return {
      id: a.id,
      name: a.full_name || a.email || "Athlete",
      email: a.email,
      timezone: a.timezone,
      isCoach: a.id === coachId,
      device: device ? { source: device.source, last_synced_at: device.last_synced_at } : null,
      readiness: readiness?.find((r) => r.athlete_id === a.id) ?? null,
      trend: (wellness ?? []).filter((w) => w.athlete_id === a.id && w.source === source),
      lastActivity: activities?.find((x) => x.athlete_id === a.id) ?? null,
    };
  });
}

/** One athlete's detail (RLS ensures the coach can only load their own athletes). */
export async function getAthleteDetail(athleteId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, timezone, coach_id")
    .eq("id", athleteId)
    .maybeSingle();
  if (!profile) return null;

  await refreshReadiness(athleteId).catch((e) => console.error("readiness refresh", athleteId, e));

  const [{ data: readiness }, { data: wellness }, { data: activities }, { data: workouts }, { data: device }] =
    await Promise.all([
      supabase
        .from("readiness_scores")
        .select("date, overall, recovery, sleep, stress, load, note, details")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .limit(14),
      supabase
        .from("daily_wellness")
        .select("date, source, hrv_ms, resting_hr, sleep_seconds, stress_avg")
        .eq("athlete_id", athleteId)
        .gte("date", daysAgo(28))
        .order("date"),
      supabase
        .from("activities")
        .select("id, sport, start_time, duration_s, distance_m, avg_hr")
        .eq("athlete_id", athleteId)
        .order("start_time", { ascending: false })
        .limit(10),
      supabase
        .from("planned_workouts")
        .select("id, scheduled_date, sport, title, status, sent_at")
        .eq("athlete_id", athleteId)
        .is("deleted_at", null)
        .gte("scheduled_date", daysAgo(7))
        .order("scheduled_date"),
      supabase.from("device_connections").select("source, last_synced_at, connected_at").eq("athlete_id", athleteId).maybeSingle(),
    ]);
  const { data: removed } = await supabase
    .from("planned_workouts")
    .select("id, scheduled_date, title, status, removal_status, removal_error, deleted_at")
    .eq("athlete_id", athleteId)
    .not("deleted_at", "is", null)
    .gte("deleted_at", new Date(Date.now() - 14 * 86400_000).toISOString())
    .order("deleted_at", { ascending: false })
    .limit(20);

  const source = device?.source ?? "garmin";
  return {
    profile,
    device,
    readiness: (readiness ?? []) as ReadinessRow[],
    trend: (wellness ?? []).filter((w) => w.source === source) as WellnessPoint[],
    activities: (activities ?? []) as ActivityRow[],
    workouts: workouts ?? [],
    removed: removed ?? [],
  };
}
