// When the pod campfire is lit: Sunday 5 pm to Monday 9 am in the pod coach's time zone. Pure.

export const OPEN_HOUR = 17; // Sunday
export const CLOSE_HOUR = 9; // Monday

function parts(at: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, weekday: p.weekday as string };
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A wall-clock time in a time zone, as a real instant. */
export function zoned(date: string, hour: number, tz: string): Date {
  let t = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(t), tz);
    const shown = Date.parse(`${p.date}T${String(p.hour).padStart(2, "0")}:00:00Z`);
    t += Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) - shown;
  }
  return new Date(t);
}

export type FireWindow = { week: string; opensAt: string; closesAt: string; open: boolean };

/** This week's campfire (open now, or the next one). */
export function fireWindow(now: Date, tz: string): FireWindow {
  const p = parts(now, tz);
  let sunday: string;
  if (p.weekday === "Sun" && p.hour >= OPEN_HOUR) sunday = p.date;
  else if (p.weekday === "Mon" && p.hour < CLOSE_HOUR) sunday = addDays(p.date, -1);
  else {
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    sunday = addDays(p.date, (7 - dow) % 7);
  }
  const opensAt = zoned(sunday, OPEN_HOUR, tz);
  const closesAt = zoned(addDays(sunday, 1), CLOSE_HOUR, tz);
  return { week: sunday, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), open: now >= opensAt && now < closesAt };
}

/** The last Sunday whose campfire has closed. */
export function lastWeek(now: Date, tz: string): string {
  const w = fireWindow(now, tz);
  return w.open || now < new Date(w.opensAt) ? addDays(w.week, -7) : w.week;
}

/** How big the fire is, 0..1: everyone who sat down adds a log. */
export const fireSize = (logs: number, members: number) => (members <= 0 ? 0 : Math.min(1, logs / Math.max(1, members)));
