// Normalized rows the browser sends after reading a Garmin account export.
// Shared by the browser parser and the server importer; keep it free of server-only imports.

export type ImportRange = "12m" | "all";

/** One calendar day of wellness. Any field may be missing; the server merges partial days. */
export type HistoryDay = {
  date: string; // YYYY-MM-DD (Garmin calendarDate, the athlete's local day)
  hrv_ms?: number | null;
  resting_hr?: number | null;
  sleep_seconds?: number | null;
  sleep_score?: number | null;
  stress_avg?: number | null;
  body_battery_high?: number | null;
  body_battery_low?: number | null;
  vo2_max?: number | null;
  training_readiness?: number | null;
};

export type HistoryActivity = {
  id: string; // Garmin activityId
  sport: string | null;
  start_time: string; // ISO UTC
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
};

export type HistoryBatch = { days: HistoryDay[]; activities: HistoryActivity[] };

export const BATCH_DAYS = 250; // the live-sync overlap check lists these dates in a URL; keep it well under gateway limits
export const BATCH_ACTIVITIES = 300;

export function cutoffDate(range: ImportRange, today = new Date()): string | null {
  if (range === "all") return null;
  const d = new Date(today);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
