// Pure parser for a Garmin account export ("Request data export" ZIP). Runs in the browser.
// Mappings were checked against a real export and the live Health API values for the same days:
//   sleep_seconds = deep + light + REM (no awake time), like the live `durationInSeconds`
//   activities: duration in ms, distance in cm, startTimeGmt in ms; activityId == live summaryId
// Only these fields are read. Locations, names, notes and everything else are ignored.
import type { HistoryActivity, HistoryDay } from "./history-types.ts";

export type ExportKind = "sleep" | "hrv" | "daily" | "activities" | "vo2max" | "readiness";

// Matched by file name, wherever the folder layout puts them (it varies between exports).
// Nested ZIPs (uploaded FIT files, backups) are never opened.
const PATTERNS: [ExportKind, RegExp][] = [
  ["sleep", /(^|\/)[^/]*_sleepData\.json$/i],
  ["hrv", /(^|\/)[^/]*_healthStatusData\.json$/i],
  ["daily", /(^|\/)UDSFile_[^/]*\.json$/i],
  ["activities", /(^|\/)[^/]*_summarizedActivities\.json$/i],
  ["vo2max", /(^|\/)MetricsMaxMetData_[^/]*\.json$/i],
  ["readiness", /(^|\/)TrainingReadinessDTO_[^/]*\.json$/i],
];

export function kindOf(path: string): ExportKind | null {
  if (!/(^|\/)DI_CONNECT\//i.test(path)) return null; // only Garmin Connect data, never orders, inReach, etc.
  for (const [kind, re] of PATTERNS) if (re.test(path)) return kind;
  return null;
}

type Rec = Record<string, unknown>;
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown): number | null => {
  const x = n(v);
  return x !== null && x > 0 ? x : null;
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const asArray = (v: unknown): Rec[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Rec[]) : []);

export type Parsed = { days: HistoryDay[]; activities: HistoryActivity[] };

export function parseExportFile(kind: ExportKind, text: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { days: [], activities: [] }; // a damaged file shouldn't sink the whole import
  }
  const recs = asArray(data);
  const days: HistoryDay[] = [];
  const activities: HistoryActivity[] = [];

  switch (kind) {
    case "sleep":
      for (const r of recs) {
        if (!isDate(r.calendarDate)) continue;
        const secs = (n(r.deepSleepSeconds) ?? 0) + (n(r.lightSleepSeconds) ?? 0) + (n(r.remSleepSeconds) ?? 0);
        const score = pos((r.sleepScores as Rec | undefined)?.overallScore);
        if (secs > 0 || score) days.push({ date: r.calendarDate, sleep_seconds: secs > 0 ? secs : null, sleep_score: score });
      }
      break;

    case "hrv":
      for (const r of recs) {
        if (!isDate(r.calendarDate)) continue;
        const hrv = asArray(r.metrics).find((m) => m.type === "HRV");
        const v = pos(hrv?.value);
        if (v) days.push({ date: r.calendarDate, hrv_ms: v });
      }
      break;

    case "daily":
      for (const r of recs) {
        if (!isDate(r.calendarDate)) continue;
        const stress = asArray((r.allDayStress as Rec | undefined)?.aggregatorList).find((a) => a.type === "TOTAL");
        const bb = asArray((r.bodyBattery as Rec | undefined)?.bodyBatteryStatList);
        const bbOf = (t: string) => n(bb.find((b) => b.bodyBatteryStatType === t)?.statsValue);
        const stressAvg = n(stress?.averageStressLevel);
        const day: HistoryDay = {
          date: r.calendarDate,
          resting_hr: pos(r.restingHeartRate),
          stress_avg: stressAvg !== null && stressAvg >= 0 ? stressAvg : null, // Garmin uses -1/-2 for "not enough data"
          body_battery_high: bbOf("HIGHEST"),
          body_battery_low: bbOf("LOWEST"),
        };
        if (day.resting_hr || day.stress_avg !== null || day.body_battery_high !== null) days.push(day);
      }
      break;

    case "activities":
      for (const wrapper of recs) {
        for (const a of asArray(wrapper.summarizedActivitiesExport)) {
          const id = n(a.activityId) ?? (typeof a.activityId === "string" ? Number(a.activityId) : null);
          const start = n(a.startTimeGmt) ?? n(a.beginTimestamp);
          if (!id || !start) continue;
          const durMs = n(a.duration) ?? n(a.elapsedDuration);
          const distCm = n(a.distance);
          activities.push({
            id: String(id),
            sport: typeof a.activityType === "string" ? a.activityType.toLowerCase().slice(0, 60) : null,
            start_time: new Date(start).toISOString(),
            duration_s: durMs !== null ? Math.round(durMs / 1000) : null,
            distance_m: distCm !== null && distCm > 0 ? +(distCm / 100).toFixed(2) : null,
            avg_hr: pos(a.avgHr),
            max_hr: pos(a.maxHr),
          });
        }
      }
      break;

    case "vo2max": {
      // Several readings a day are possible (run and bike); keep the highest.
      const best = new Map<string, number>();
      for (const r of recs) {
        const v = pos(r.vo2MaxValue);
        if (isDate(r.calendarDate) && v) best.set(r.calendarDate, Math.max(v, best.get(r.calendarDate) ?? 0));
      }
      for (const [date, v] of best) days.push({ date, vo2_max: v });
      break;
    }

    case "readiness": {
      // Garmin recomputes readiness through the day; keep the first (morning) score, which is what plans are built on.
      const first = new Map<string, { t: string; score: number }>();
      for (const r of recs) {
        const score = n(r.score);
        if (!isDate(r.calendarDate) || score === null) continue;
        const t = typeof r.timestamp === "string" ? r.timestamp : "";
        const prev = first.get(r.calendarDate);
        if (!prev || t < prev.t) first.set(r.calendarDate, { t, score });
      }
      for (const [date, v] of first) days.push({ date, training_readiness: v.score });
      break;
    }
  }
  return { days, activities };
}
