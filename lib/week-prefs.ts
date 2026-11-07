// The athlete's preferred week: which disciplines they like on which days, roughly how long they
// have, and a short note. Pure module so it can be tested directly with `node`.

export const WEEKDAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;
export type DayKey = (typeof WEEKDAYS)[number][0];
export const WEEK_SPORTS = [
  ["swim", "Swim"],
  ["bike", "Bike"],
  ["run", "Run"],
  ["strength", "Strength"],
  ["rest", "Rest"],
] as const;
export type WeekSport = (typeof WEEK_SPORTS)[number][0];
export type DayPref = { sports: WeekSport[]; minutes: number | null; note: string };
export type WeekPrefs = Record<DayKey, DayPref>;

const SPORT_IDS = new Set<string>(WEEK_SPORTS.map(([k]) => k));
export const emptyDay = (): DayPref => ({ sports: [], minutes: null, note: "" });

/** Whatever came from the database or a form, as a clean week. "Rest" excludes everything else. */
export function cleanWeek(raw: unknown): WeekPrefs {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, Partial<DayPref>>;
  const out = {} as WeekPrefs;
  for (const [k] of WEEKDAYS) {
    const d = src[k] ?? {};
    let sports = [...new Set((Array.isArray(d.sports) ? d.sports : []).filter((s): s is WeekSport => typeof s === "string" && SPORT_IDS.has(s)))];
    if (sports.includes("rest")) sports = ["rest"];
    const m = Number(d.minutes);
    out[k] = {
      sports,
      minutes: sports.includes("rest") || !Number.isFinite(m) || m <= 0 ? null : Math.min(600, Math.round(m / 5) * 5),
      note: typeof d.note === "string" ? d.note.replace(/\s+/g, " ").trim().slice(0, 80) : "",
    };
  }
  return out;
}

export const hasWeek = (w: WeekPrefs) => WEEKDAYS.some(([k]) => w[k].sports.length || w[k].note);

/** One line per day for the planner, e.g. "Saturday: bike (up to 240 min) - group ride". */
export function weekForPrompt(w: WeekPrefs): string[] {
  return WEEKDAYS.filter(([k]) => w[k].sports.length || w[k].note).map(([k, label]) => {
    const d = w[k];
    const what = d.sports.length ? d.sports.join(" or ") : "any";
    return `${label}: ${what}${d.minutes ? ` (up to ${d.minutes} min)` : ""}${d.note ? ` - ${d.note}` : ""}`;
  });
}
