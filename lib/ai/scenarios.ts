// Pure scenario data for AI test mode (no imports beyond types), so it can be tested with `node`.
import type { Step } from "../workouts/garmin-format.ts";

export type Scenario = "poor_sleep" | "high_load" | "normal" | "missing_data";

export const SCENARIOS: Record<Scenario, { name: string; blurb: string; expect: string }> = {
  poor_sleep: {
    name: "Test · Poor sleep + low HRV",
    blurb: "4.6 h sleep (score 41), HRV ~30% below baseline, resting HR up 6 bpm.",
    expect: "Red. Expect rest or an easy swap for today's threshold session.",
  },
  high_load: {
    name: "Test · High training load",
    blurb: "Last 7 days roughly double their usual volume at higher heart rates; sleep fine, HRV slightly down.",
    expect: "Red on load. Expect a reduced or easier session.",
  },
  normal: {
    name: "Test · Normal day",
    blurb: "Everything inside their usual range.",
    expect: "Green. The assistant should skip this athlete (no Claude call for them).",
  },
  missing_data: {
    name: "Test · Missing data",
    blurb: "Only 9 of the last 12 nights recorded, no HRV for 3 nights, nothing before that; resting HR a bit up.",
    expect: "Yellow. The summary should say plainly that data is thin.",
  },
};

// Deterministic pseudo-random so a reset gives the same data every time.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Wellness = { hrv_ms: number | null; resting_hr: number | null; sleep_seconds: number | null; sleep_score: number | null; stress_avg: number | null; body_battery_high: number | null };

function baselineDay(r: () => number): Wellness {
  const j = (spread: number) => (r() - 0.5) * 2 * spread;
  return {
    hrv_ms: Math.round(70 + j(6)),
    resting_hr: Math.round(48 + j(2)),
    sleep_seconds: Math.round((7.5 + j(0.5)) * 3600),
    sleep_score: Math.round(80 + j(6)),
    stress_avg: Math.round(25 + j(5)),
    body_battery_high: Math.round(85 + j(8)),
  };
}

function todayFor(s: Scenario): Wellness {
  switch (s) {
    case "poor_sleep":
      return { hrv_ms: 49, resting_hr: 54, sleep_seconds: Math.round(4.6 * 3600), sleep_score: 41, stress_avg: 38, body_battery_high: 46 };
    case "high_load":
      return { hrv_ms: 64, resting_hr: 50, sleep_seconds: Math.round(7.1 * 3600), sleep_score: 74, stress_avg: 30, body_battery_high: 72 };
    case "normal":
      // Exactly at their averages, so it can't randomly tip into yellow.
      return { hrv_ms: 70, resting_hr: 48, sleep_seconds: 7.5 * 3600, sleep_score: 80, stress_avg: 25, body_battery_high: 85 };
    case "missing_data":
      // Resting HR +3 bpm and stress a touch high: enough for yellow; no HRV or sleep recorded.
      return { hrv_ms: null, resting_hr: 51, sleep_seconds: null, sleep_score: null, stress_avg: 28, body_battery_high: null };
  }
}

export const easyRun: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 1 } },
  { kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2400 }, target: { type: "hr_zone", zone: 2 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 300 } },
];
export const threshold: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 900 }, target: { type: "hr_zone", zone: 2 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 480 }, target: { type: "pace_range", slowSecPerKm: 245, fastSecPerKm: 235 } },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } },
    ],
  },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 } },
];
export const longRun: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "hr_zone", zone: 1 } },
  { kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 22000 }, target: { type: "hr_zone", zone: 2 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];


export type SeedDay = { date: string } & Wellness;
export type SeedActivity = { date: string; external: string; duration_s: number; distance_m: number; avg_hr: number; max_hr: number };

/** 28 days of history plus today for one scenario. Deterministic for a given index. */
export function generateScenario(key: Scenario, today: string, index: number): { wellness: SeedDay[]; activities: SeedActivity[] } {
  const r = rng(1000 + index * 77);
  const wellness: SeedDay[] = [];
  const activities: SeedActivity[] = [];
  for (let d = 28; d >= 1; d--) {
    const date = addDays(today, -d);
    const skip = key === "missing_data" && (d > 12 || d % 4 === 0); // 9 nights in the last 12 days, with gaps
    if (!skip) {
      const w = baselineDay(r);
      if (key === "missing_data" && d <= 3) {
        w.hrv_ms = null;
        w.sleep_seconds = null;
        w.sleep_score = null;
      }
      wellness.push({ date, ...w });
    }
    // Training: ~5 sessions/week at ~45 min; high_load roughly doubles volume at higher HR in the last 7 days.
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 5 && !(key === "missing_data" && d > 12)) {
      const hard = key === "high_load" && d <= 7;
      const minutes = hard ? 80 + r() * 20 : 40 + r() * 15;
      activities.push({
        date,
        external: `${key}-${date}`,
        duration_s: Math.round(minutes * 60),
        distance_m: Math.round(minutes * (hard ? 210 : 180)),
        avg_hr: Math.round(hard ? 158 + r() * 6 : 140 + r() * 6),
        max_hr: hard ? 182 : 168,
      });
    }
  }
  wellness.push({ date: today, ...todayFor(key) });
  return { wellness, activities };
}

export const addDaysIso = addDays;
