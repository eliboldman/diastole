// Readiness engine: compares an athlete's day to their own rolling baseline.
// Pure module (no imports) so it can be tested directly with `node`.
//
// Flags are training guidance, not medical advice.

export type Flag = "green" | "yellow" | "red" | "unknown";

export type WellnessDay = {
  date: string; // YYYY-MM-DD, athlete-local
  hrv_ms?: number | null;
  resting_hr?: number | null;
  sleep_seconds?: number | null;
  sleep_score?: number | null;
  stress_avg?: number | null;
  body_battery_high?: number | null;
};

export type ActivityLite = {
  date: string; // athlete-local date the activity started
  duration_s?: number | null;
  avg_hr?: number | null;
  max_hr?: number | null;
};

export type Readiness = {
  date: string;
  overall: Flag;
  recovery: Flag;
  sleep: Flag;
  stress: Flag;
  load: Flag;
  note: string;
  details: Record<string, unknown>;
};

export const BASELINE_DAYS = 28;
export const MIN_BASELINE_POINTS = 7;
const LOAD_ACUTE_DAYS = 7;
const MIN_LOAD_HISTORY_DAYS = 14;

const RANK: Record<Flag, number> = { unknown: -1, green: 0, yellow: 1, red: 2 };
export const worst = (...flags: Flag[]): Flag =>
  flags.reduce<Flag>((w, f) => (RANK[f] > RANK[w] ? f : w), "unknown");

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Stats = { mean: number; sd: number; n: number };

function stats(values: number[]): Stats | null {
  if (values.length < MIN_BASELINE_POINTS) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance), n: values.length };
}

/** z-score with a floor on SD so very steady athletes aren't flagged for tiny wobbles. */
function z(value: number, s: Stats, minSd: number) {
  return (value - s.mean) / Math.max(s.sd, minSd);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function baselineOf(history: WellnessDay[], date: string, key: keyof WellnessDay) {
  const from = addDays(date, -BASELINE_DAYS);
  const values = history
    .filter((d) => d.date >= from && d.date < date)
    .map((d) => num(d[key]))
    .filter((v): v is number => v !== null);
  return stats(values);
}

/** Heart-rate-weighted minutes (a simple TRIMP-like load). */
export function activityLoad(a: ActivityLite, restingHr: number, maxHr: number) {
  const minutes = (a.duration_s ?? 0) / 60;
  if (!minutes) return 0;
  if (!a.avg_hr || maxHr <= restingHr) return minutes * 0.5; // no HR: assume moderate
  const reserve = Math.min(1, Math.max(0, (a.avg_hr - restingHr) / (maxHr - restingHr)));
  return minutes * reserve;
}

export function computeReadiness(
  date: string,
  wellness: WellnessDay[],
  activities: ActivityLite[],
): Readiness {
  const today = wellness.find((d) => d.date === date) ?? { date };
  const notes: string[] = [];
  const details: Record<string, unknown> = {};

  // ---- Recovery: HRV (lower is worse) and resting HR (higher is worse)
  let hrvFlag: Flag = "unknown";
  const hrvBase = baselineOf(wellness, date, "hrv_ms");
  const hrv = num(today.hrv_ms);
  if (hrvBase && hrv !== null) {
    const zz = z(hrv, hrvBase, hrvBase.mean * 0.05);
    const pct = Math.round(((hrv - hrvBase.mean) / hrvBase.mean) * 100);
    hrvFlag = zz <= -2 ? "red" : zz <= -1 ? "yellow" : "green";
    details.hrv = { today: hrv, baseline: Math.round(hrvBase.mean), pct, z: +zz.toFixed(2) };
    if (hrvFlag !== "green") notes.push(`HRV ${Math.abs(pct)}% below baseline`);
  }

  let rhrFlag: Flag = "unknown";
  const rhrBase = baselineOf(wellness, date, "resting_hr");
  const rhr = num(today.resting_hr);
  if (rhrBase && rhr !== null) {
    const zz = z(rhr, rhrBase, 1.5);
    const diff = Math.round(rhr - rhrBase.mean);
    rhrFlag = zz >= 2 && diff >= 5 ? "red" : zz >= 1 && diff >= 3 ? "yellow" : "green";
    details.resting_hr = { today: rhr, baseline: Math.round(rhrBase.mean), diff, z: +zz.toFixed(2) };
    if (rhrFlag !== "green") notes.push(`resting HR +${diff} bpm`);
  }
  const recovery = worst(hrvFlag, rhrFlag);

  // ---- Sleep: duration vs baseline and absolute floors; Garmin sleep score if present
  let durFlag: Flag = "unknown";
  const sleepSec = num(today.sleep_seconds);
  if (sleepSec !== null) {
    const hours = sleepSec / 3600;
    const base = baselineOf(wellness, date, "sleep_seconds");
    const relZ = base ? z(sleepSec, base, 20 * 60) : 0;
    durFlag = hours < 5 || relZ <= -2 ? "red" : hours < 6 || relZ <= -1 ? "yellow" : "green";
    details.sleep = { hours: +hours.toFixed(1), baseline_hours: base ? +(base.mean / 3600).toFixed(1) : null };
    if (durFlag !== "green") notes.push(`slept ${Math.floor(hours)}h${String(Math.round((hours % 1) * 60)).padStart(2, "0")}`);
  }
  let scoreFlag: Flag = "unknown";
  const score = num(today.sleep_score);
  if (score !== null) {
    scoreFlag = score < 45 ? "red" : score < 60 ? "yellow" : "green";
    details.sleep_score = score;
    if (scoreFlag !== "green" && durFlag === "green") notes.push(`sleep score ${score}`);
  }
  const sleep = worst(durFlag, scoreFlag);

  // ---- Stress (Garmin only): average stress vs baseline; Body Battery peak
  let stressFlag: Flag = "unknown";
  const stressBase = baselineOf(wellness, date, "stress_avg");
  const stressAvg = num(today.stress_avg);
  if (stressBase && stressAvg !== null) {
    const zz = z(stressAvg, stressBase, 3);
    stressFlag = zz >= 2 ? "red" : zz >= 1 ? "yellow" : "green";
    details.stress = { today: stressAvg, baseline: Math.round(stressBase.mean) };
    if (stressFlag !== "green") notes.push(`stress elevated (${stressAvg} vs ${Math.round(stressBase.mean)})`);
  }
  let bbFlag: Flag = "unknown";
  const bb = num(today.body_battery_high);
  if (bb !== null) {
    bbFlag = bb < 30 ? "red" : bb < 50 ? "yellow" : "green";
    details.body_battery_high = bb;
    if (bbFlag !== "green") notes.push(`Body Battery peaked at ${bb}`);
  }
  const stress = worst(stressFlag, bbFlag);

  // ---- Load: acute (7d) vs chronic (28d weekly average), HR-weighted minutes
  let load: Flag = "unknown";
  const firstDataDate = [...wellness.map((d) => d.date), ...activities.map((a) => a.date)].sort()[0];
  if (firstDataDate && firstDataDate <= addDays(date, -MIN_LOAD_HISTORY_DAYS)) {
    const restingHr = rhrBase?.mean ?? 55;
    const maxHr = Math.max(190, ...activities.map((a) => a.max_hr ?? 0));
    const sumLoad = (fromDays: number) =>
      activities
        .filter((a) => a.date >= addDays(date, -fromDays) && a.date < date)
        .reduce((s, a) => s + activityLoad(a, restingHr, maxHr), 0);
    const acute = sumLoad(LOAD_ACUTE_DAYS);
    const chronicWeekly = (sumLoad(BASELINE_DAYS) / BASELINE_DAYS) * 7;
    if (chronicWeekly > 0) {
      const ratio = acute / chronicWeekly;
      load = ratio > 1.5 ? "red" : ratio > 1.3 ? "yellow" : "green";
      details.load = { acute: Math.round(acute), chronic_weekly: Math.round(chronicWeekly), ratio: +ratio.toFixed(2) };
      if (load !== "green") notes.push(`training load ${Math.round((ratio - 1) * 100)}% above usual`);
    }
  }

  const overall = worst(recovery, sleep, stress, load);

  let note: string;
  if (overall === "unknown") note = "Building baseline — flags start after about a week of data.";
  else if (overall === "green") note = "Recovery markers look normal. Train as planned.";
  else {
    const what = notes.join(", ");
    note =
      overall === "red"
        ? `${capitalize(what)}. Consider an easy day or rest.`
        : `${capitalize(what)}. Consider keeping intensity moderate.`;
  }

  return { date, overall, recovery, sleep, stress, load, note, details };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
