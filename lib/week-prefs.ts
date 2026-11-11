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
/** When they like to train that day, local time ("05:00" to "07:00"). */
export type Window = { start: string; end: string };
export type DayPref = { sports: WeekSport[]; minutes: number | null; note: string; window: Window | null };
export type WeekPrefs = Record<DayKey, DayPref>;

const SPORT_IDS = new Set<string>(WEEK_SPORTS.map(([k]) => k));
export const emptyDay = (): DayPref => ({ sports: [], minutes: null, note: "", window: null });

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const cleanWindow = (w: unknown): Window | null => {
  const o = (w && typeof w === "object" ? w : {}) as Partial<Window>;
  if (typeof o.start !== "string" || !HHMM.test(o.start)) return null;
  const end = typeof o.end === "string" && HHMM.test(o.end) && o.end > o.start ? o.end : null;
  return { start: o.start, end: end ?? o.start };
};

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
      window: sports.includes("rest") ? null : cleanWindow(d.window),
    };
  }
  return out;
}

export const hasWeek = (w: WeekPrefs) => WEEKDAYS.some(([k]) => w[k].sports.length || w[k].note || w[k].window);

/** "5:00 am" from "05:00". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** The training window for a date's weekday (date as YYYY-MM-DD), or null. */
export function windowFor(w: WeekPrefs, date: string): Window | null {
  const day = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return w[WEEKDAYS[day][0]].window;
}

/** One line per day for the planner, e.g. "Saturday: bike (up to 240 min) - group ride". */
export function weekForPrompt(w: WeekPrefs): string[] {
  return WEEKDAYS.filter(([k]) => w[k].sports.length || w[k].note || w[k].window).map(([k, label]) => {
    const d = w[k];
    const what = d.sports.length ? d.sports.join(" or ") : "any";
    const when = d.window ? ` ${clock12(d.window.start)}${d.window.end !== d.window.start ? `–${clock12(d.window.end)}` : ""}` : "";
    return `${label}: ${what}${when}${d.minutes ? ` (up to ${d.minutes} min)` : ""}${d.note ? ` - ${d.note}` : ""}`;
  });
}
