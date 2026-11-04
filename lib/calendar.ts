// Pure month-grid math for the calendar (dates as YYYY-MM-DD strings, no time zones involved).

export type Month = { year: number; month: number }; // month is 1-12

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** "2026-11" -> {2026, 11}; anything invalid falls back to the month containing `today`. */
export function parseMonth(value: string | undefined, today: string): Month {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) return { year: +m[1], month: +m[2] };
  return { year: +today.slice(0, 4), month: +today.slice(5, 7) };
}

export const monthKey = ({ year, month }: Month) => `${year}-${pad(month)}`;

export function shiftMonth({ year, month }: Month, by: number): Month {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole weeks (Sunday first) covering the month: 4 to 6 rows of 7 dates. */
export function monthGrid({ year, month }: Month): string[][] {
  const first = ymd(year, month, 1);
  const lead = new Date(`${first}T12:00:00Z`).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = addDays(first, -lead);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** The calendar day of an instant in a time zone. */
export const dayIn = (iso: string, timeZone: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone });
