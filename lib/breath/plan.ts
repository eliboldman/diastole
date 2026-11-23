// Breathwork (2026-11-23): guided breathing picked from the athlete's day, a personal pace instead of a
// fixed "5.5", and an honest look at whether it's helping, using the overnight data Diastole already has.
// Pure, for tests. General wellness guidance, not medical treatment.

export type Kind = "resonance" | "downshift" | "sigh" | "box" | "finder";
export type PhaseKind = "in" | "top" | "hold" | "out" | "rest";
export type Phase = { kind: PhaseKind; seconds: number };

export const DEFAULT_PACE = 5.5; // breaths a minute; the average of 4.5–6.5, where most people's resonance sits
export const FINDER_PACES = [6.5, 6, 5.5, 5, 4.5] as const;
export const FINDER_STEP_SECONDS = 90;

export type SessionInfo = {
  kind: Kind;
  title: string;
  short: string; // a few words on the card
  why: string; // what it's for and what backs it
  minutes: number[]; // lengths to choose from; the first is the default
};

export const SESSIONS: Record<Kind, SessionInfo> = {
  resonance: {
    kind: "resonance",
    title: "Recovery breathing",
    short: "Slow, even breaths at your pace",
    why: "Breathing around 5–6 times a minute lines up your breathing with your heart-rate rhythm. That's where heart-rate variability peaks and your body shifts toward recovery. This is the best-studied part of breathwork.",
    minutes: [10, 5, 15],
  },
  downshift: {
    kind: "downshift",
    title: "Sleep downshift",
    short: "Long, slow breaths out before bed",
    why: "Breaths out that get longer than the breath in slow your heart and help you settle. Do it in bed with the lights down.",
    minutes: [8, 5, 12],
  },
  sigh: {
    kind: "sigh",
    title: "Cyclic sighing",
    short: "Double breath in, long sigh out",
    why: "Two breaths in through the nose, then a long, slow breath out. In a 2023 Stanford study, five minutes a day improved mood and lowered breathing rate more than mindfulness meditation did.",
    minutes: [5, 3],
  },
  box: {
    kind: "box",
    title: "Race-day focus",
    short: "In, hold, out, hold. Four each",
    why: "An even, steady rhythm to calm nerves without making you sleepy. Use it before a race or key session.",
    minutes: [3, 5],
  },
  finder: {
    kind: "finder",
    title: "Find your pace",
    short: "Five paces, 90 seconds each",
    why: "Everyone's best pace is a little different (most people fall between 4.5 and 6.5 breaths a minute). Try five, rate how each felt, and Diastole uses your best one for recovery breathing.",
    minutes: [8],
  },
};



/** One breath cycle of a session. `progress` (0–1) is how far through it is; the sleep downshift lengthens the breath out as it goes. */
export function cycle(kind: Kind, pace: number = DEFAULT_PACE, progress = 0): Phase[] {
  switch (kind) {
    case "resonance":
    case "finder": {
      // Equal in and out: the pattern that gave the most heart-rate variability at 5.5 a minute (Lin et al. 2014).
      const half = 60 / clampPace(pace) / 2;
      return [{ kind: "in", seconds: half }, { kind: "out", seconds: half }];
    }
    case "downshift": {
      const out = progress < 1 / 3 ? 6 : progress < 2 / 3 ? 7 : 8;
      return [{ kind: "in", seconds: 4 }, { kind: "out", seconds: out }];
    }
    case "sigh":
      return [{ kind: "in", seconds: 3 }, { kind: "top", seconds: 1.5 }, { kind: "out", seconds: 6.5 }, { kind: "rest", seconds: 1 }];
    case "box":
      return [{ kind: "in", seconds: 4 }, { kind: "hold", seconds: 4 }, { kind: "out", seconds: 4 }, { kind: "rest", seconds: 4 }];
  }
}

export const clampPace = (p: number) => (Number.isFinite(p) ? Math.min(Math.max(p, 3), 12) : DEFAULT_PACE);

export const PHASE_WORDS: Record<PhaseKind, string> = { in: "Breathe in", top: "Top up", hold: "Hold", out: "Breathe out", rest: "Pause" };

/** Pick the pace from finder ratings: the highest-rated, ties going to the one nearest 5.5, then the quicker. */
export function pickPace(ratings: Record<string, number>): number | null {
  const rows = Object.entries(ratings)
    .map(([p, v]) => ({ p: Number(p), v }))
    .filter((x) => FINDER_PACES.includes(x.p as never) && Number.isInteger(x.v) && x.v >= 1 && x.v <= 5);
  if (!rows.length) return null;
  rows.sort((a, b) => b.v - a.v || Math.abs(a.p - DEFAULT_PACE) - Math.abs(b.p - DEFAULT_PACE) || b.p - a.p);
  return rows[0].p;
}

// ── What to suggest today ────────────────────────────────────────────────────────────────────────

export type DayContext = {
  hour: number; // local, 0–23
  readiness: "green" | "yellow" | "red" | null;
  trainedMinutes: number; // finished today
  hardToday: boolean; // a hard or long session today
  raceToday: boolean;
  raceTomorrow: boolean;
  doneToday: Kind[]; // sessions already done today
};
export type Suggestion = { kind: Kind; minutes: number; why: string };

export function suggest(c: DayContext): Suggestion {
  const done = new Set(c.doneToday);
  if (c.raceToday && c.hour < 15 && !done.has("box")) return { kind: "box", minutes: 3, why: "Race day. Three steady minutes to settle the nerves." };
  if (c.hour >= 20 || c.hour < 4) {
    return { kind: "downshift", minutes: 8, why: c.raceTomorrow ? "The night before a race. Long breaths out help you fall asleep." : "Bedtime. Long breaths out to settle for sleep." };
  }
  if ((c.hardToday || c.trainedMinutes >= 75) && !done.has("resonance")) {
    return { kind: "resonance", minutes: 10, why: "After today's session. Ten slow minutes help you switch into recovery." };
  }
  if (c.readiness === "red" && !done.has("resonance")) return { kind: "resonance", minutes: 10, why: "Readiness is low today. Slow breathing is an easy way to help it." };
  if (c.raceTomorrow) return { kind: "resonance", minutes: 5, why: "Race tomorrow. Keep the nerves down today." };
  return { kind: "sigh", minutes: 5, why: c.readiness === "yellow" ? "Readiness is so-so. Five minutes of sighing is a quick reset." : "A quick five-minute reset for your day." };
}

// ── The CO2 hold check ───────────────────────────────────────────────────────────────────────────

/** A seated "comfortable hold": after a normal breath out, nose pinched, until the first clear urge to breathe. */
export const HOLD_STEPS = [
  "Sit down somewhere safe. Never on land near water, in water, or driving.",
  "Breathe quietly through your nose for a minute.",
  "Breathe out normally (not all the way), pinch your nose and tap Start.",
  "Tap Stop at the first clear urge to breathe, not when you can't take it anymore. Your first breath after should be calm.",
];

export const HOLD_SAFETY =
  "Seated only. Never practice breath holds in or near water. Triathletes, this is how shallow-water blackout happens. Skip holds if you're pregnant or have a heart, lung or seizure condition.";

export function holdBand(seconds: number): { label: string; tone: "low" | "mid" | "good" } {
  if (seconds < 15) return { label: "Low", tone: "low" };
  if (seconds < 25) return { label: "Fair", tone: "mid" };
  if (seconds < 40) return { label: "Good", tone: "good" };
  return { label: "Great", tone: "good" };
}

/** How the latest holds compare with where they started: the median of the first three vs the last three. Needs 4+. */
export function holdTrend(holds: { taken_on: string; seconds: number }[]): { from: number; to: number; change: number } | null {
  const rows = [...holds].sort((a, b) => a.taken_on.localeCompare(b.taken_on));
  if (rows.length < 4) return null;
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const from = med(rows.slice(0, 3).map((r) => Number(r.seconds)));
  const to = med(rows.slice(-3).map((r) => Number(r.seconds)));
  return { from, to, change: Math.round(to - from) };
}

// ── Is it working for you? ───────────────────────────────────────────────────────────────────────

export type SessionRow = { kind: Kind; local_date: string; local_hour: number; calm_before: number | null; calm_after: number | null };
export type NightRow = { date: string; hrv_ms: number | null; resting_hr: number | null }; // date = the morning after

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const MIN_NIGHTS = 5;

/**
 * Overnight HRV and resting HR after evening breathing (a session from 5pm on) vs nights without, from one
 * wearable's numbers. An honest comparison, not a trial: people may breathe more on rough days, so it can
 * understate the effect. Null until there are MIN_NIGHTS of each.
 */
export function nightsEffect(sessions: SessionRow[], nights: NightRow[]) {
  const evenings = new Set(sessions.filter((s) => s.kind !== "finder" && s.local_hour >= 17).map((s) => nextDay(s.local_date)));
  const withHrv = nights.filter((n) => n.hrv_ms != null && n.hrv_ms > 0);
  const after = withHrv.filter((n) => evenings.has(n.date));
  const other = withHrv.filter((n) => !evenings.has(n.date));
  if (after.length < MIN_NIGHTS || other.length < MIN_NIGHTS) return { ready: false as const, after: after.length, other: other.length };
  const hrvAfter = mean(after.map((n) => Number(n.hrv_ms)));
  const hrvOther = mean(other.map((n) => Number(n.hrv_ms)));
  const rhr = (rows: NightRow[]) => rows.map((n) => Number(n.resting_hr)).filter((x) => x > 0);
  const ra = rhr(after), ro = rhr(other);
  return {
    ready: true as const,
    after: after.length,
    other: other.length,
    hrvPct: Math.round(((hrvAfter - hrvOther) / hrvOther) * 100),
    rhrDiff: ra.length && ro.length ? Math.round((mean(ra) - mean(ro)) * 10) / 10 : null,
  };
}

/** The average change in how calm the athlete felt, before vs after a session (1–5 scale). */
export function calmShift(sessions: SessionRow[]): { n: number; change: number } | null {
  const rows = sessions.filter((s) => s.calm_before != null && s.calm_after != null);
  if (rows.length < 3) return null;
  return { n: rows.length, change: Math.round(mean(rows.map((s) => s.calm_after! - s.calm_before!)) * 10) / 10 };
}

/** Days in a row with at least one session, ending today or yesterday. */
export function streak(dates: string[], today: string): number {
  const set = new Set(dates);
  let d = set.has(today) ? today : new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  return n;
}

export const KINDS: Kind[] = ["resonance", "downshift", "sigh", "box", "finder"];
export const isKind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as string[]).includes(k);
