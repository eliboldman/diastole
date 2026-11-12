// Living race poster: an A-race poster that starts in grayscale and fills with color, one region at
// a time, as the key sessions leading up to it get done. Fully colored by race day. Pure (tested).
// Sessions skipped through "Life happened" count as filled: no gray patches for looking after yourself.

export const REGIONS = 12;
export const WINDOW_WEEKS = 16;

export type KeySession = { id: string; date: string; title: string; status: "done" | "excused" | "open" };
export type PosterRegion = { index: number; colored: boolean; sessions: KeySession[] };
export type PosterState = { regions: PosterRegion[]; colored: number; finished: boolean; keys: number };

/** Key sessions: an hour or more, or with real intensity in it. */
export const isKey = (s: { minutes: number | null; hard: boolean }) => (s.minutes ?? 0) >= 60 || s.hard;

/** The window: up to 16 weeks before the race, from when the race was added. */
export function windowStart(raceDate: string, createdAt: string) {
  const earliest = new Date(Date.parse(`${raceDate}T12:00:00Z`) - WINDOW_WEEKS * 7 * 86_400_000).toISOString().slice(0, 10);
  const added = createdAt.slice(0, 10);
  return added > earliest ? added : earliest;
}

/** Spread key sessions (oldest first) across the poster's regions and color the finished ones. */
export function posterState(keys: KeySession[], raceDate: string, today: string): PosterState {
  const sorted = [...keys].sort((a, b) => a.date.localeCompare(b.date));
  const finished = today >= raceDate;
  const regions: PosterRegion[] = Array.from({ length: REGIONS }, (_, i) => ({ index: i, colored: false, sessions: [] }));
  sorted.forEach((s, k) => regions[Math.min(REGIONS - 1, Math.floor((k * REGIONS) / Math.max(1, sorted.length)))].sessions.push(s));
  for (const r of regions) r.colored = finished || (r.sessions.length > 0 && r.sessions.every((s) => s.status !== "open"));
  return { regions, colored: regions.filter((r) => r.colored).length, finished, keys: sorted.length };
}

/** A hex color as gray (same lightness), for the uncolored regions. */
export function grayOf(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const v = Math.round(y * 0.85 + 20).toString(16).padStart(2, "0");
  return `#${v}${v}${v}`;
}
