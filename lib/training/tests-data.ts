import type { SupabaseClient } from "@supabase/supabase-js";

import { detectTest, type TestKind } from "./tests";

export type TestGroup = "bike" | "swim" | "run";
export type TestStatus = Record<TestGroup, { last: string | null; activityId: string | null; planned: { id: string; date: string; kind: TestKind } | null }>;

const GROUP: Record<TestKind, TestGroup> = { ftp20: "bike", ramp: "bike", css: "swim", run30: "run" };

/** When each kind of threshold test was last done (past year), and any test already on the plan. */
export async function getTestStatus(supabase: SupabaseClient, athleteId: string, today: string): Promise<TestStatus> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const [{ data: acts }, { data: planned }] = await Promise.all([
    supabase.from("activities").select("id, start_time, sport, name, planned_workouts(test_kind)").eq("athlete_id", athleteId).gte("start_time", since).order("start_time", { ascending: false }).limit(2000),
    supabase.from("planned_workouts").select("id, scheduled_date, test_kind, status").eq("athlete_id", athleteId).not("test_kind", "is", null).gte("scheduled_date", today).neq("status", "completed").order("scheduled_date"),
  ]);
  const out: TestStatus = { bike: { last: null, activityId: null, planned: null }, swim: { last: null, activityId: null, planned: null }, run: { last: null, activityId: null, planned: null } };
  for (const a of acts ?? []) {
    const pw = (Array.isArray(a.planned_workouts) ? a.planned_workouts[0] : a.planned_workouts) as { test_kind?: string | null } | null;
    const kind = detectTest({ name: a.name, sport: a.sport, planned_test: pw?.test_kind ?? null });
    if (kind && !out[GROUP[kind]].last) out[GROUP[kind]] = { ...out[GROUP[kind]], last: String(a.start_time).slice(0, 10), activityId: a.id as string };
  }
  for (const p of planned ?? []) {
    const g = GROUP[p.test_kind as TestKind];
    if (g && !out[g].planned) out[g].planned = { id: p.id as string, date: p.scheduled_date as string, kind: p.test_kind as TestKind };
  }
  return out;
}
