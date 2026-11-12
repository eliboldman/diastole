// When a meal was eaten, as the athlete tells us: "just now", "N minutes ago", or a clock time on
// today or an earlier day (in their own timezone). Pure module so it can be tested with `node`.

export type EatenAt = { ago: number } | { date: string; time: string };

export const AGO_CHOICES = [
  { ago: 0, label: "Just now" },
  { ago: 30, label: "30 min ago" },
  { ago: 60, label: "1 hr ago" },
  { ago: 120, label: "2 hr ago" },
] as const;

export const MAX_DAYS_BACK = 3; // a meal can be moved up to 3 days back
const MIN = 60_000;

/** Milliseconds `timeZone` is ahead of UTC at instant `ms`. */
function offsetMs(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** A wall-clock date and time in `timeZone` as an instant (ms). Handles DST by re-checking the offset. */
export function zonedToUtc(date: string, time: string, timeZone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t || +t[1] > 23 || +t[2] > 59) return null;
  const naive = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
  let ms = naive - offsetMs(naive, timeZone);
  ms = naive - offsetMs(ms, timeZone);
  return Number.isFinite(ms) ? ms : null;
}

export const localDateOf = (ms: number, timeZone: string) => new Date(ms).toLocaleDateString("en-CA", { timeZone });

/**
 * The instant a meal was eaten, or an error. Not in the future (5 min grace for clock drift), and
 * not more than MAX_DAYS_BACK days back.
 */
export function resolveEatenAt(input: EatenAt | null | undefined, timeZone: string, nowMs: number): { ok: true; ms: number } | { ok: false; error: string } {
  if (!input) return { ok: true, ms: nowMs };
  let ms: number | null;
  if ("ago" in input) {
    const ago = Number(input.ago);
    if (!Number.isFinite(ago) || ago < 0) return { ok: false, error: "Pick when you ate it." };
    ms = nowMs - Math.round(ago) * MIN;
  } else {
    ms = zonedToUtc(String(input.date), String(input.time), timeZone);
    if (ms === null) return { ok: false, error: "Pick a valid time." };
  }
  if (ms > nowMs + 5 * MIN) return { ok: false, error: "That time hasn't happened yet." };
  if (ms < nowMs - MAX_DAYS_BACK * 24 * 60 * MIN) return { ok: false, error: `Meals can be moved up to ${MAX_DAYS_BACK} days back.` };
  return { ok: true, ms };
}
