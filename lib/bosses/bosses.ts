// Weakness bosses: once a month, rules pick one limiter per athlete from their own data; the coach
// approves (or swaps, or skips) before the athlete sees anything. Sessions the coach tags chip away at
// the boss; measurable improvement deals bonus damage. Pure (tested in bosses.test.ts).
// Bosses are friendly, never about weight, food or health, and only the athlete and coach see them.

export type Limiter = "fade" | "climbing" | "swim" | "consistency";
export const LIMITERS: Limiter[] = ["fade", "climbing", "swim", "consistency"];

export type BossMeta = {
  name: string; // the creature (original)
  limiter: string; // what it stands for, plainly
  intro: string; // how the athlete meets it
  how: string; // what beats it
  better: "lower" | "higher"; // the metric's good direction
  unit: string;
  reward: string; // exclusive gear item id
};

export const BOSS: Record<Limiter, BossMeta> = {
  fade: {
    name: "The Fizzle",
    limiter: "Holding pace late in long sessions",
    intro: "A little spark that loves the last third of your long sessions, when the pace starts to drift.",
    how: "Long sessions with a strong finish and steady pacing. Finishing as fast as you started deals bonus damage.",
    better: "lower",
    unit: "% slower in the last third",
    reward: "jersey:negative_split",
  },
  climbing: {
    name: "Grumblehill",
    limiter: "Climbing",
    intro: "A sleepy, grumpy hill that thinks you'll slow down when the road tips up.",
    how: "Hill repeats and climbing sessions. Putting out more power uphill than on the flat deals bonus damage.",
    better: "higher",
    unit: "× flat power on climbs",
    reward: "helmet:summit",
  },
  swim: {
    name: "Puddlewump",
    limiter: "Swim efficiency",
    intro: "A wobbly blob of pool water that makes every length feel longer than it is.",
    how: "Technique and drill sets. A better SWOLF (time plus strokes per length) deals bonus damage.",
    better: "lower",
    unit: "SWOLF per 25",
    reward: "aura:riptide",
  },
  consistency: {
    name: "Snoozlet",
    limiter: "Consistency",
    intro: "A cozy cloud in a nightcap that whispers \"tomorrow\" about planned sessions.",
    how: "Every planned session you finish this month. Finishing more of the plan than usual deals bonus damage.",
    better: "higher",
    unit: "% of planned sessions done",
    reward: "jersey:metronome",
  },
};

export const BOSS_HP = 100;
export const HIT_TAGGED = 20; // a session the coach tagged against the boss
export const HIT_PLANNED = 6; // Snoozlet: any planned session finished
export const BONUS_MAX = 40;
export const DEFEAT_GRIT = 100;

// ---------------------------------------------------------------- picking a limiter

export type PickInput = {
  long: { first: number; last: number }[]; // long sessions: avg speed or power, first vs last third
  climbs: number[]; // rides: climb power / flat power
  swims: number[]; // SWOLF per 25, oldest first
  swimShare: number; // fraction of sessions that are swims
  planned: number; // planned sessions in the window (past)
  done: number; // of those, done
};
export type Pick = { limiter: Limiter; severity: number; value: number; line: string };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export const fadeOf = (l: { first: number; last: number }) => (l.first > 0 ? (1 - l.last / l.first) * 100 : 0);

/** Every limiter with enough data, scored 0..1 (worst first). */
export function candidates(i: PickInput): Pick[] {
  const out: Pick[] = [];
  if (i.long.length >= 3) {
    const f = avg(i.long.map(fadeOf));
    out.push({ limiter: "fade", severity: clamp01((f - 3) / 9), value: r1(f), line: `Long sessions slowed ${r1(f)}% in the last third (${i.long.length} sessions).` });
  }
  if (i.climbs.length >= 3) {
    const c = avg(i.climbs);
    out.push({ limiter: "climbing", severity: clamp01((1.12 - c) / 0.15), value: r2(c), line: `Climbing power averaged ${r2(c)}× flat power over ${i.climbs.length} rides (most riders push 10–20% more uphill).` });
  }
  if (i.swims.length >= 3 && i.swimShare >= 0.15) {
    const recent = avg(i.swims.slice(-3));
    const before = i.swims.length >= 6 ? avg(i.swims.slice(0, -3)) : recent;
    const stuck = recent >= before - 0.3;
    out.push({ limiter: "swim", severity: clamp01((stuck ? 0.45 : 0.2) + (recent - before) / 6), value: r1(recent), line: `SWOLF ${r1(recent)} per 25 over the last 3 swims${i.swims.length >= 6 ? `, ${stuck ? "not improving" : "improving"} from ${r1(before)}` : ""}.` });
  }
  if (i.planned >= 8) {
    const pct = (i.done / i.planned) * 100;
    out.push({ limiter: "consistency", severity: clamp01((90 - pct) / 30), value: Math.round(pct), line: `${i.done} of ${i.planned} planned sessions done in the last 8 weeks (${Math.round(pct)}%).` });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** This month's suggestion: the worst limiter, if it's clearly a limiter. */
export function pickLimiter(i: PickInput): Pick | null {
  const c = candidates(i)[0];
  return c && c.severity >= 0.25 ? c : null;
}

// ---------------------------------------------------------------- damage

/** Bonus damage from improvement against the starting number (only counts going the right way). */
export function bonusDamage(limiter: Limiter, baseline: number | null, now: number | null): number {
  if (baseline == null || now == null || baseline === 0) return 0;
  const better = BOSS[limiter].better === "lower" ? baseline - now : now - baseline;
  if (better <= 0) return 0;
  // Each limiter's "meaningful" step: 2 fade points, 0.05 climb ratio, 1 SWOLF, 10 consistency points.
  const step = { fade: 2, climbing: 0.05, swim: 1, consistency: 10 }[limiter];
  return Math.min(BONUS_MAX, Math.round((better / step) * 20));
}

export const healthLeft = (hp: number, hits: { amount: number }[]) => Math.max(0, hp - hits.reduce((s, h) => s + h.amount, 0));

/** The first of the month for a local date. */
export const monthOf = (date: string) => `${date.slice(0, 7)}-01`;
