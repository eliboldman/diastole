// Bedtime coaching, rules only: tonight's bedtime worked back from tomorrow's first session (or the
// athlete's wake time), the evening nudges, and how consistently bedtimes were hit. Times are
// minutes after the local midnight that starts the evening's date (so 22:30 = 1350, 00:30 = 1470).
// Pure module, testable with `node`.

import { clock12, windowFor, type WeekPrefs } from "../week-prefs.ts";

export type SleepPrefs = {
  wake_time: string | null; // "HH:MM"
  sleep_goal_min: number | null;
  buffer_min: number;
  nudges: boolean;
  quiet_start: string; // "HH:MM"
  quiet_end: string;
  wind_down: string | null;
};
export const DEFAULT_PREFS: SleepPrefs = { wake_time: null, sleep_goal_min: null, buffer_min: 45, nudges: true, quiet_start: "22:30", quiet_end: "06:00", wind_down: null };

export type NextPlan = { title: string; sport: string; start_time: string | null };
export type Bedtime = {
  bedtimeMin: number; // minutes after the evening's midnight (may pass 1440)
  goalMin: number;
  basis: "session" | "wake";
  first: { title: string; start: string } | null; // tomorrow's first session
};

const DAY = 1440;
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
/** "9:45 pm" for minutes after the evening's midnight. */
export const minClock = (min: number) => {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return clock12(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
};
const hoursText = (min: number) => {
  const h = Math.round((min / 60) * 2) / 2;
  return `${h % 1 ? h.toFixed(1) : h} hour${h === 1 ? "" : "s"}`;
};

/** Sleep goal from their own nights: the median, to the nearest 15 minutes, 6.5 to 10 hours (8 if unknown). */
export function defaultGoal(sleepSeconds: (number | null)[]): number {
  const mins = sleepSeconds.filter((s): s is number => typeof s === "number" && s > 3 * 3600).map((s) => s / 60).sort((a, b) => a - b);
  if (mins.length < 5) return 480;
  const median = mins[Math.floor(mins.length / 2)];
  return Math.min(600, Math.max(390, Math.round(median / 15) * 15));
}

/**
 * Tonight's bedtime: tomorrow's first session (its time, or the athlete's window that day) minus the
 * prep/travel buffer and the sleep goal; otherwise the wake time minus the goal; null if neither.
 */
export function bedtimeFor(opts: { tomorrow: string; plans: NextPlan[]; week: WeekPrefs; prefs: SleepPrefs; goalMin: number }): Bedtime | null {
  const win = windowFor(opts.week, opts.tomorrow);
  const timed = opts.plans
    .map((p) => ({ p, start: p.start_time?.slice(0, 5) ?? win?.start ?? null }))
    .filter((x): x is { p: NextPlan; start: string } => Boolean(x.start))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const goal = opts.goalMin;
  if (timed) {
    return { bedtimeMin: DAY + toMin(timed.start) - opts.prefs.buffer_min - goal, goalMin: goal, basis: "session", first: { title: timed.p.title, start: timed.start } };
  }
  if (opts.prefs.wake_time) return { bedtimeMin: DAY + toMin(opts.prefs.wake_time) - goal, goalMin: goal, basis: "wake", first: null };
  return null;
}

/** Is this minute (after the evening's midnight) inside quiet hours? Quiet hours usually cross midnight. */
export function inQuiet(min: number, prefs: SleepPrefs): boolean {
  const qs = toMin(prefs.quiet_start);
  const qe = toMin(prefs.quiet_end);
  const m = ((min % DAY) + DAY) % DAY;
  return qs <= qe ? m >= qs && m < qe : m >= qs || m < qe;
}

export type Nudge = { kind: "wind" | "lights"; atMin: number; title: string; body: string };

/** At most two friendly nudges for the evening, never in quiet hours. */
export function nudgesFor(b: Bedtime, prefs: SleepPrefs): Nudge[] {
  if (!prefs.nudges) return [];
  const hours = hoursText(b.goalMin);
  const what = b.first ? `${b.first.title} at ${clock12(b.first.start)} tomorrow` : null;
  const out: Nudge[] = [
    {
      kind: "wind",
      atMin: b.bedtimeMin - 60,
      title: "Time to start winding down",
      body: what ? `${what}. Start winding down so you get your ${hours}.` : `Start winding down so you get your ${hours} before your ${minClock(toMin(prefs.wake_time ?? "06:00"))} wake-up.`,
    },
    {
      kind: "lights",
      atMin: b.bedtimeMin - 15,
      title: "Lights out soon",
      body: `Aim for lights out by ${minClock(b.bedtimeMin)} to get your ${hours}.`,
    },
  ];
  return out.filter((n) => !inQuiet(n.atMin, prefs)).slice(0, 2);
}

// ---------------------------------------------------------------- consistency

export type Night = { date: string; targetMin: number | null; sleepStartMin: number | null }; // both after that evening's midnight
export const SLACK_MIN = 20;

/** Minutes after the evening's midnight for a sleep start, given its local date and time. */
export function startMin(nightDate: string, localDate: string, localHHMM: string): number {
  return toMin(localHHMM) + (localDate > nightDate ? DAY : 0);
}

export function consistency(nights: Night[]): { hit: number; total: number } {
  const judged = nights.filter((n) => n.targetMin !== null && n.sleepStartMin !== null);
  return { hit: judged.filter((n) => n.sleepStartMin! <= n.targetMin! + SLACK_MIN).length, total: judged.length };
}

/** The weekly morning follow-up, in the coach's voice. Null when there's too little to say. */
export function recapText(c: { hit: number; total: number }, hrvChangePct: number | null): string | null {
  if (c.total < 3) return null;
  const hrv = hrvChangePct === null ? "" : hrvChangePct >= 3 ? `, and your HRV's up ${Math.round(hrvChangePct)}%` : hrvChangePct <= -3 ? `. HRV dipped ${Math.abs(Math.round(hrvChangePct))}%, so tonight's a good one to protect` : "";
  if (c.hit / c.total >= 0.7) return `You hit your bedtime ${c.hit} of ${c.total} nights this week${hrv}. Nice work.`;
  return `You hit your bedtime ${c.hit} of ${c.total} nights this week${hrv}. A fresh week starts tonight.`;
}

/** The UTC instant for a local date plus minutes after its midnight, in a time zone (DST-safe). */
export function zonedInstant(date: string, minutes: number, tz: string): Date {
  const naive = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
  let t = naive;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    const asLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    t = naive - (asLocal - t);
  }
  return new Date(t);
}
