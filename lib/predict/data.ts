import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/server";

import { EFFORT_M, predictAll, predictRace, predictRun, RUNS, trendOf, type Prediction, type PredictInput, type RunEffort, type RunKey } from "./predict";

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export type Trend = { seconds: number; since: string };
export type PredictionView = {
  today: string;
  input: PredictInput;
  predictions: Prediction[];
  trends: Record<string, Trend>;
  note: { text: string; updatedAt: string } | null;
  hidden: boolean;
};

/** Inputs for the estimates: best efforts (last 4 months), zones, weight. Caller's client; row-level security applies. */
export async function predictInput(supabase: SupabaseClient, athleteId: string, today: string): Promise<PredictInput> {
  const since = new Date(Date.parse(`${addDays(today, -125)}T00:00:00Z`)).toISOString();
  const [{ data: acts }, { data: zones }, { data: body }, { data: prof }] = await Promise.all([
    supabase.from("activities").select("id, start_time").eq("athlete_id", athleteId).gte("start_time", since).limit(1500),
    supabase.from("athlete_zones").select("ftp_w, threshold_speed_mps, css_sec_per_100m").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_body").select("weight_kg").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("profiles").select("units").eq("id", athleteId).maybeSingle(),
  ]);
  const dateOf = new Map((acts ?? []).map((a) => [a.id as string, String(a.start_time).slice(0, 10)]));
  const ids = [...dateOf.keys()];
  const efforts: RunEffort[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("activity_details").select("activity_id, bests").in("activity_id", ids.slice(i, i + 300)).not("bests", "is", null);
    for (const d of data ?? []) {
      const b = (d.bests ?? {}) as Record<string, number>;
      for (const key of Object.keys(EFFORT_M) as RunKey[]) if (b[key] > 0) efforts.push({ date: dateOf.get(d.activity_id as string)!, key, seconds: Number(b[key]) });
    }
  }
  return {
    today,
    efforts,
    thresholdSpeed: zones?.threshold_speed_mps ? Number(zones.threshold_speed_mps) : null,
    ftp: zones?.ftp_w ?? null,
    css: zones?.css_sec_per_100m ? Number(zones.css_sec_per_100m) : null,
    weightKg: body?.weight_kg ? Number(body.weight_kg) : null,
    yards: prof?.units !== "km",
  };
}

/** Estimates for the standard distances, trend against a few weeks back, the coach's note, hidden flag. */
export async function getPredictions(supabase: SupabaseClient, athleteId: string, tz: string): Promise<PredictionView> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz || "America/Chicago" });
  const [input, { data: snaps }, { data: note }, { data: prof }] = await Promise.all([
    predictInput(supabase, athleteId, today),
    supabase.from("race_prediction_snapshots").select("date, key, seconds").eq("athlete_id", athleteId).gte("date", addDays(today, -56)).lte("date", addDays(today, -14)).order("date"),
    supabase.from("race_prediction_notes").select("note, updated_at").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("profiles").select("hide_predictions").eq("id", athleteId).maybeSingle(),
  ]);
  const predictions = predictAll(input).filter((p) => p.range.mid > 0 || p.key.startsWith("tri_"));

  // Trend: the oldest snapshot 2–8 weeks back. Before snapshots exist, runs compare best efforts then vs now.
  const trends: Record<string, Trend> = {};
  for (const p of predictions) {
    if (!p.range.mid) continue;
    const old = (snaps ?? []).find((s) => s.key === p.key);
    if (old) {
      const d = trendOf(p.range.mid, old.seconds);
      if (d !== null) trends[p.key] = { seconds: d, since: old.date };
      continue;
    }
    const run = RUNS.find((r) => r.key === p.key);
    if (run) {
      const asOf = addDays(today, -42);
      const then = predictRun(run.meters, { today: asOf, efforts: input.efforts.filter((e) => e.date <= asOf), thresholdSpeed: null });
      const now = predictRun(run.meters, { today, efforts: input.efforts, thresholdSpeed: null });
      const d = now && then ? trendOf(now.range.mid, then.range.mid) : null;
      if (d !== null) trends[p.key] = { seconds: d, since: asOf };
    }
  }

  // Today's snapshot (once a day; the server writes, nobody else can).
  const rows = predictions.filter((p) => p.range.mid >= 30).map((p) => ({ athlete_id: athleteId, date: today, key: p.key, seconds: p.range.mid }));
  if (rows.length) await createAdminClient().from("race_prediction_snapshots").upsert(rows, { onConflict: "athlete_id,date,key", ignoreDuplicates: true });

  return { today, input, predictions, trends, note: note ? { text: note.note, updatedAt: note.updated_at } : null, hidden: Boolean(prof?.hide_predictions) };
}

/** One race's estimate (race page). */
export async function getRacePrediction(supabase: SupabaseClient, race: { athlete_id: string; sport: string; distance_km: number | null }, tz: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz || "America/Chicago" });
  const [input, { data: note }, { data: prof }] = await Promise.all([
    predictInput(supabase, race.athlete_id, today),
    supabase.from("race_prediction_notes").select("note, updated_at").eq("athlete_id", race.athlete_id).maybeSingle(),
    supabase.from("profiles").select("hide_predictions").eq("id", race.athlete_id).maybeSingle(),
  ]);
  return { prediction: predictRace({ sport: race.sport, distance_km: race.distance_km === null ? null : Number(race.distance_km) }, input), note: note ? { text: note.note, updatedAt: note.updated_at } : null, hidden: Boolean(prof?.hide_predictions) };
}
