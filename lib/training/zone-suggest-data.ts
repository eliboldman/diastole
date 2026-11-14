import type { SupabaseClient } from "@supabase/supabase-js";

import type { Lap, Streams } from "@/lib/activity/fit";

import { analyzeTest, detectTest, mergeWithTests, suggestFromTests, type DoneTest } from "./tests";
import { hrAtPower, suggestZones, type Effort, type SteadyLap, type Suggestion } from "./zone-suggest";

const WINDOW_DAYS = 60;

/** Zone suggestions per athlete from the last 60 days (caller's client; row-level security applies). */
export async function getZoneSuggestions(supabase: SupabaseClient, athleteIds: string[]): Promise<Map<string, Suggestion[]>> {
  const out = new Map<string, Suggestion[]>();
  if (!athleteIds.length) return out;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: zones }, { data: acts }] = await Promise.all([
    supabase.from("athlete_zones").select("athlete_id, ftp_w, threshold_speed_mps, max_hr, css_sec_per_100m, dismissed").in("athlete_id", athleteIds),
    supabase.from("activities").select("id, athlete_id, start_time, duration_s, max_hr, sport, name, planned_workouts(test_kind)").in("athlete_id", athleteIds).gte("start_time", since).limit(3000),
  ]);
  const ids = (acts ?? []).map((a) => a.id as string);
  const bests = new Map<string, Effort["bests"]>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("activity_details").select("activity_id, bests").in("activity_id", ids.slice(i, i + 300)).not("bests", "is", null);
    for (const d of data ?? []) bests.set(d.activity_id as string, d.bests as Effort["bests"]);
  }
  // Threshold tests: the planned test an activity completed, or a name like "FTP test". Only their files are read.
  const tests = (acts ?? [])
    .map((a) => {
      const pw = (Array.isArray(a.planned_workouts) ? a.planned_workouts[0] : a.planned_workouts) as { test_kind?: string | null } | null;
      return { a, kind: detectTest({ name: a.name, sport: a.sport, planned_test: pw?.test_kind ?? null }) };
    })
    .filter((x) => x.kind);
  const done = new Map<string, DoneTest[]>();
  if (tests.length) {
    const { data: files } = await supabase.from("activity_details").select("activity_id, streams, laps").in("activity_id", tests.map((x) => x.a.id));
    for (const { a, kind } of tests) {
      const f = files?.find((x) => x.activity_id === a.id);
      const result = f ? analyzeTest(kind!, { streams: f.streams as Streams, laps: f.laps as Lap[] }) : null;
      if (result) done.set(a.athlete_id, [...(done.get(a.athlete_id) ?? []), { activity_id: a.id, start_time: a.start_time, result }]);
    }
  }
  const BIKE = /cycl|bik|ride|spin/i;
  const rideEnds = (acts ?? []).filter((a) => BIKE.test(a.sport ?? "")).map((a) => ({ athlete: a.athlete_id, end: Date.parse(a.start_time) + Number(a.duration_s ?? 0) * 1000 }));
  const offBike = (a: { athlete_id: string; start_time: string; sport: string | null }) =>
    /run|treadmill|track|trail/i.test(a.sport ?? "") && rideEnds.some((r) => r.athlete === a.athlete_id && Date.parse(a.start_time) - r.end >= -60_000 && Date.parse(a.start_time) - r.end <= 30 * 60_000);

  // HR at power, only for athletes whose best ride would suggest a higher FTP: read their ride laps.
  const hrChecks = new Map<string, ReturnType<typeof hrAtPower>>();
  for (const id of athleteIds) {
    const z = (zones ?? []).find((x) => x.athlete_id === id);
    const rides = (acts ?? []).filter((a) => a.athlete_id === id && BIKE.test(a.sport ?? "") && !/run/i.test(a.sport ?? ""));
    const best = Math.max(0, ...rides.map((a) => Number(bests.get(a.id)?.power_20m ?? 0)));
    if (!z?.ftp_w || best * 0.95 < Number(z.ftp_w) * 1.03) continue;
    const { data: lapRows } = await supabase.from("activity_details").select("activity_id, laps").in("activity_id", rides.map((a) => a.id));
    const steady: SteadyLap[] = [];
    for (const r of lapRows ?? []) {
      const start = Date.parse(rides.find((a) => a.id === r.activity_id)!.start_time);
      for (const l of (r.laps ?? []) as Lap[])
        if (l.duration_s && l.avg_power && l.avg_hr) steady.push({ start_time: new Date(start + l.start_s * 1000).toISOString(), duration_s: l.duration_s, avg_power: l.avg_power, avg_hr: l.avg_hr });
    }
    hrChecks.set(id, hrAtPower(steady, Number(z.ftp_w)));
  }

  for (const id of athleteIds) {
    const z = (zones ?? []).find((x) => x.athlete_id === id) ?? null;
    const efforts: Effort[] = (acts ?? []).filter((a) => a.athlete_id === id).map((a) => ({ activity_id: a.id, start_time: a.start_time, sport: a.sport, max_hr: a.max_hr, bests: bests.get(a.id) ?? null, offBike: offBike(a), hrCheck: hrChecks.get(id) ?? null }));
    const s = mergeWithTests<Suggestion>(suggestZones(z, efforts), suggestFromTests(z as Parameters<typeof suggestFromTests>[0], done.get(id) ?? []));
    if (s.length) out.set(id, s);
  }
  return out;
}
