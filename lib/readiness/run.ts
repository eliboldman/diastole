import "server-only";

import { createAdminClient } from "@/lib/supabase/server";

import { BASELINE_DAYS, computeReadiness, type ActivityLite, type WellnessDay } from "./engine";

const HISTORY_DAYS = BASELINE_DAYS + 7;

export function localDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Recompute and store today's readiness for one athlete (athlete-local date). */
export async function refreshReadiness(athleteId: string, date?: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("timezone").eq("id", athleteId).single();
  const tz = profile?.timezone ?? "America/Los_Angeles";
  const day = date ?? localDate(new Date(), tz);
  const since = new Date(Date.now() - HISTORY_DAYS * 86400_000).toISOString().slice(0, 10);

  const [{ data: wellnessRows }, { data: activityRows }] = await Promise.all([
    admin
      .from("daily_wellness")
      .select("date, source, hrv_ms, resting_hr, sleep_seconds, sleep_score, stress_avg, body_battery_high")
      .eq("athlete_id", athleteId)
      .gte("date", since),
    admin
      .from("activities")
      .select("start_time, duration_s, avg_hr, max_hr")
      .eq("athlete_id", athleteId)
      .gte("start_time", since),
  ]);

  // One source per athlete (HRV scales differ between Garmin and Apple): use whichever has more days.
  const rows = wellnessRows ?? [];
  const garminDays = rows.filter((r) => r.source === "garmin").length;
  const source = garminDays >= rows.length - garminDays ? "garmin" : "apple";
  const wellness: WellnessDay[] = rows.filter((r) => r.source === source);

  const activities: ActivityLite[] = (activityRows ?? []).map((a) => ({
    date: localDate(new Date(a.start_time), tz),
    duration_s: a.duration_s,
    avg_hr: a.avg_hr,
    max_hr: a.max_hr,
  }));

  const r = computeReadiness(day, wellness, activities);
  const { error } = await admin.from("readiness_scores").upsert(
    {
      athlete_id: athleteId,
      date: r.date,
      overall: r.overall,
      recovery: r.recovery,
      sleep: r.sleep,
      stress: r.stress,
      load: r.load,
      note: r.note,
      details: { ...r.details, source },
      computed_at: new Date().toISOString(),
    },
    { onConflict: "athlete_id,date" },
  );
  if (error) throw error;
  return r;
}
