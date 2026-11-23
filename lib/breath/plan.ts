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
  why: string; // what it's for, in a sentence or two
  when: string; // when to reach for it
  how: string[]; // how to do it
  works: string; // how it works, in plain words
  evidence: string; // what backs it, honestly
  minutes: number[]; // lengths to choose from; the first is the default
};

export const SESSIONS: Record<Kind, SessionInfo> = {
  resonance: {
    kind: "resonance",
    title: "Recovery breathing",
    short: "Slow, even breaths at your pace",
    why: "Your main recovery tool. Slow, even breathing at your own pace moves your body out of training mode and into recovery mode.",
    when: "After hard or long sessions, on low-readiness days, the day before a race, or any time you feel wound up. 10 minutes is the sweet spot.",
    how: ["Sit or lie down, shoulders soft.", "Breathe in through your nose as the circle grows, out as it shrinks. In and out are the same length.", "Breathe low and quiet, letting your lower ribs widen. Don't take big gulps."],
    works: "Your heart rate naturally speeds up when you breathe in and slows when you breathe out. At around 5–6 breaths a minute that rise and fall lines up with your blood-pressure reflex. The swings get as big as they can, heart-rate variability peaks, and the 'rest and recover' side of your nervous system takes over.",
    evidence: "Strong. Dozens of studies (pooled in a 2023 meta-analysis of 31 trials) show slow breathing raises HRV and calms you during and right after. A 2014 study found 5.5 breaths a minute with an equal in and out gave the highest HRV of the patterns it tested. Uses your pace from the pace finder, or 5.5 until you've done it.",
    minutes: [10, 5, 15],
  },
  downshift: {
    kind: "downshift",
    title: "Sleep downshift",
    short: "Long, slow breaths out before bed",
    why: "Helps you fall asleep, especially after evening training or before a race when your mind is racing.",
    when: "In bed with the lights down, as the last thing you do. Great the night before a race.",
    how: ["Lie on your back or side, eyes closed. Turn tones on and buzz off if you share a bed.", "Breathe in for 4 through your nose.", "Breathe out slowly for 6. It stretches to 7, then 8 as you go. Let the breath out be lazy, like a sigh."],
    works: "Your heart slows on every breath out, so making the breath out longer than the breath in tips the balance toward calm. Slowing gradually lets your body follow without straining. If you drift off mid-session, that's a win.",
    evidence: "Good for calming and slowing heart rate during the session. Evidence that it improves sleep itself is smaller but promising. It's also low risk, so worth trying.",
    minutes: [8, 5, 12],
  },
  sigh: {
    kind: "sigh",
    title: "Cyclic sighing",
    short: "Double breath in, long sigh out",
    why: "A quick reset for stress, nerves or a bad mood. The fastest way to feel calmer in a few minutes.",
    when: "Between classes, before a hard workout you're dreading, after a stressful day, or any time you need a mental reset. Five minutes.",
    how: ["Breathe in through your nose until nearly full.", "Then a second short breath in on top, to fill right up.", "Then a long, slow breath out through your mouth, like a sigh, until empty."],
    works: "The second breath in re-opens tiny air sacs in your lungs, and the long breath out is when your heart slows the most. It's the same pattern your body uses on its own when you sigh or after crying.",
    evidence: "Good. In a 2023 Stanford study (Balban et al., Cell Reports Medicine), five minutes a day for a month improved mood and lowered resting breathing rate more than mindfulness meditation did.",
    minutes: [5, 3],
  },
  box: {
    kind: "box",
    title: "Race-day focus",
    short: "In, hold, out, hold. Four each",
    why: "Calms nerves without making you sleepy, so you stay sharp. For race mornings and key sessions.",
    when: "On the start line, in the warm-up area, or before a big workout or test. Three minutes.",
    how: ["Breathe in for 4.", "Hold gently for 4. No straining, throat relaxed.", "Breathe out for 4, then pause for 4. Repeat."],
    works: "A steady, even count gives your mind something to hold onto and slows your breathing, which takes the edge off adrenaline. It's more upbeat than the slow recovery breathing, so you don't go flat before racing.",
    evidence: "Moderate. Widely used by the military and in sport for staying calm under pressure, and slow breathing reliably reduces arousal. There are fewer controlled trials of box breathing specifically.",
    minutes: [3, 5],
  },
  finder: {
    kind: "finder",
    title: "Find your pace",
    short: "Five paces, 90 seconds each",
    why: "Finds your own best breathing pace, so recovery breathing fits you instead of a one-size-fits-all number.",
    when: "Once to start, then every couple of months as your fitness changes. Sitting quietly, not right after training.",
    how: ["Follow each pace for 90 seconds: 6.5, 6, 5.5, 5, then 4.5 breaths a minute.", "After each, rate how easy and calming it felt.", "With a heart-rate sensor connected, Diastole also measures how far your heart rate swings with each breath, the lab method for finding this pace."],
    works: "Everyone's 'resonant' pace (where heart rate and breathing sync up best) is a little different, mostly from 4.5 to 6.5 breaths a minute. Taller people and bigger bodies tend to be slower. In a lab it's found by watching heart rate at several paces; this does the same with your sensor, or your feel when you don't have one.",
    evidence: "This is the standard approach in HRV biofeedback research (Lehrer and colleagues): try paces from 6.5 to 4.5 and pick the one with the biggest heart-rate swing.",
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

/**
 * Pick the pace. With heart-rate swings for at least four paces, the biggest swing among the paces that felt
 * OK (rated 3+): the lab method. Otherwise the highest-rated, ties going nearest 5.5, then the quicker.
 */
export function pickPace(ratings: Record<string, number>, swings?: Record<string, number> | null): number | null {
  const rows = Object.entries(ratings)
    .map(([p, v]) => ({ p: Number(p), v }))
    .filter((x) => FINDER_PACES.includes(x.p as never) && Number.isInteger(x.v) && x.v >= 1 && x.v <= 5);
  if (!rows.length) return null;
  const sw = Object.entries(swings ?? {})
    .map(([p, v]) => ({ p: Number(p), v: Number(v) }))
    .filter((x) => FINDER_PACES.includes(x.p as never) && Number.isFinite(x.v) && x.v > 0);
  if (sw.length >= 4) {
    const ok = new Set(rows.filter((r) => r.v >= 3).map((r) => r.p));
    const pool = sw.filter((x) => ok.has(x.p));
    const use = pool.length ? pool : sw;
    use.sort((a, b) => b.v - a.v || Math.abs(a.p - DEFAULT_PACE) - Math.abs(b.p - DEFAULT_PACE) || b.p - a.p);
    return use[0].p;
  }
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
