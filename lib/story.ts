// Phase 12: the season story, a shareable summary of a stretch of training.
// Pure module so it can be tested directly with `node`.

export type StoryPeriod = "month" | "quarter" | "year";
export const PERIODS: { id: StoryPeriod; label: string; days: number }[] = [
  { id: "month", label: "Last 30 days", days: 30 },
  { id: "quarter", label: "Last 3 months", days: 91 },
  { id: "year", label: "Last 12 months", days: 365 },
];
/** A calendar month, "2026-10". */
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
/** A rolling period id, or a calendar month ("2026-10"); anything else falls back to the last 3 months. */
export const asPeriod = (v: unknown): StoryPeriod | string => (isMonth(v) ? v : PERIODS.some((p) => p.id === v) ? (v as StoryPeriod) : "quarter");

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1];
/** The month before ("2026-01" → "2025-12"). */
export function prevMonth(m: string) {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
const nextMonth = (m: string) => {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

/** Local dates [from, to) for a period, with the labels the page and image use. */
export function periodRange(period: string, today: string): { from: string; to: string; label: string; heading: string; monthly: boolean } {
  if (isMonth(period)) {
    const year = period.slice(0, 4);
    return { from: `${period}-01`, to: `${nextMonth(period)}-01`, label: `${monthName(period)} ${year}`, heading: monthName(period), monthly: true };
  }
  const p = PERIODS.find((x) => x.id === period) ?? PERIODS[1];
  return { from: addDays(today, -p.days + 1), to: addDays(today, 1), label: p.label, heading: "season", monthly: false };
}

type Act = { sport: string | null; start_time: string; duration_s: number | null; distance_m: number | null };
export type Story = {
  hours: number;
  workouts: number;
  bySport: { key: "run" | "bike" | "swim" | "other"; label: string; hours: number; km: number }[];
  longest: { label: string; minutes: number } | null;
  bestStreakWeeks: number;
  prs: number;
  races: number;
  readyPct: number | null;
};

const family = (s: string | null): Story["bySport"][number]["key"] => {
  const t = (s ?? "").toLowerCase();
  if (/swim/.test(t)) return "swim";
  if (/run|treadmill|track|trail/.test(t)) return "run";
  if (/cycl|bike|biking|ride|spin/.test(t)) return "bike";
  return "other";
};
const LABEL = { run: "Run", bike: "Bike", swim: "Swim", other: "Other" } as const;

/** Monday (UTC date string) of the week a time falls in. */
const weekOf = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function buildStory(o: { activities: Act[]; prs: number; races: number; readiness: string[] }): Story {
  const acts = o.activities.filter((a) => (a.duration_s ?? 0) >= 300);
  const sports = new Map<Story["bySport"][number]["key"], { hours: number; km: number }>();
  for (const a of acts) {
    const k = family(a.sport);
    const s = sports.get(k) ?? { hours: 0, km: 0 };
    s.hours += (a.duration_s ?? 0) / 3600;
    s.km += (a.distance_m ?? 0) / 1000;
    sports.set(k, s);
  }
  const bySport = [...sports.entries()]
    .map(([key, v]) => ({ key, label: LABEL[key], hours: Math.round(v.hours * 10) / 10, km: Math.round(v.km) }))
    .filter((s) => s.hours >= 0.5)
    .sort((a, b) => b.hours - a.hours);

  const top = acts.reduce<Act | null>((m, a) => ((a.duration_s ?? 0) > (m?.duration_s ?? 0) ? a : m), null);

  // Longest run of consecutive weeks with at least one workout.
  const weeks = [...new Set(acts.map((a) => weekOf(a.start_time)))].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    const t = Date.parse(w);
    run = prev != null && t - prev === 7 * 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }

  const flagged = o.readiness.filter((r) => r === "green" || r === "yellow" || r === "red");
  return {
    hours: Math.round(acts.reduce((t, a) => t + (a.duration_s ?? 0), 0) / 360) / 10,
    workouts: acts.length,
    bySport,
    longest: top ? { label: LABEL[family(top.sport)], minutes: Math.round((top.duration_s ?? 0) / 60) } : null,
    bestStreakWeeks: best,
    prs: o.prs,
    races: o.races,
    readyPct: flagged.length >= 7 ? Math.round((flagged.filter((r) => r === "green").length / flagged.length) * 100) : null,
  };
}
