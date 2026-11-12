// Post-workout protein nudge: about 30 minutes after a workout reaches Diastole, a light-hearted
// line about that workout plus "get ~30 g of protein in the next 30 minutes". It stays quiet when
// the athlete has already logged a protein-containing meal since finishing.
//
// Fixed, hand-written lines (no AI). Nothing here mentions body weight, size or appearance.
// Pure module so it can be tested directly with `node`.

export type NudgeActivity = { id: string; sport: string | null; start_time: string; duration_s: number | null; distance_m: number | null; created_at: string };
export type NudgeMeal = { eaten_at: string; protein_g: number };

export const NUDGE = {
  delayMin: 30, // after the workout reaches Diastole
  catchUpMin: 120, // a missed scheduler run still sends up to this long after upload
  maxSinceEndMin: 180, // a workout that finished longer ago than this (late sync, history) gets nothing
  minSessionS: 20 * 60, // same as the refuel view: shorter sessions don't need a recovery snack
  proteinG: 10, // a meal with at least this much protein counts as "already had protein"
  earlyMin: 10, // a meal logged up to 10 min before the recorded end still counts (watch stopped late)
  gapMin: 180, // at most one nudge per athlete in this window (bricks, the same session from two devices)
} as const;

const MIN = 60_000;
export const endOf = (a: NudgeActivity) => Date.parse(a.start_time) + (a.duration_s ?? 0) * 1000;

export type NudgeDecision = "send" | "ate" | "wait" | "skip";

/**
 * "wait": not 30 minutes since upload yet. "skip": too short, too old, or a nudge went out recently.
 * "ate": protein already logged since finishing (stays quiet). "send": nudge now.
 */
export function decideNudge(a: NudgeActivity, meals: NudgeMeal[], nowMs: number, lastNudgeMs: number | null): NudgeDecision {
  if ((a.duration_s ?? 0) < NUDGE.minSessionS) return "skip";
  const endMs = endOf(a);
  const upMs = Date.parse(a.created_at);
  if (nowMs - upMs < NUDGE.delayMin * MIN) return "wait";
  if (nowMs - upMs > NUDGE.catchUpMin * MIN) return "skip";
  if (nowMs - endMs > NUDGE.maxSinceEndMin * MIN || endMs > nowMs) return "skip";
  if (lastNudgeMs !== null && nowMs - lastNudgeMs < NUDGE.gapMin * MIN) return "skip";
  const ate = meals.some((m) => {
    const t = Date.parse(m.eaten_at);
    return m.protein_g >= NUDGE.proteinG && t >= endMs - NUDGE.earlyMin * MIN && t <= nowMs;
  });
  return ate ? "ate" : "send";
}

type Kind = "run" | "bike" | "swim" | "strength" | "other";
function kindOf(sport: string | null): Kind {
  const s = sport ?? "";
  if (/swim/i.test(s)) return "swim";
  if (/run|walk|hik|trail|treadmill|track/i.test(s)) return "run";
  if (/cycl|bik|ride|spin/i.test(s)) return "bike";
  if (/strength|weight|gym|lift|hiit|crossfit|training/i.test(s)) return "strength";
  return "other";
}

const round1 = (n: number) => (n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ""));
function distance(kind: Kind, m: number | null, units: "mi" | "km"): string | null {
  if (!m || m < 50) return null;
  if (kind === "swim") return units === "mi" ? `${Math.round(m / 0.9144 / 25) * 25} yd` : `${Math.round(m / 25) * 25} m`;
  return units === "mi" ? `${round1(m / 1609.344)} mi` : `${round1(m / 1000)} km`;
}
function duration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 90) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} hours`;
}

// {d} = distance (falls back to duration when there is none), {t} = duration.
const LINES: Record<Kind, { long: string[]; any: string[] }> = {
  run: {
    long: [
      "{d} on foot. Your shoes have asked for a union rep.",
      "{t} of running. Somewhere a couch is wondering where you've been all day.",
      "{d} done. Your legs are drafting a strongly worded letter, but they're proud of you.",
    ],
    any: [
      "{d} in the bank. The pavement never stood a chance.",
      "{d} run: logged, done, legendary.",
      "That was {d} of pure determination. Your future self just sent a thank-you note.",
      "{d}. You ran away from your problems and came back faster.",
    ],
  },
  bike: {
    long: [
      "{t} in the saddle. Your quads would like a word, and the word is \"thanks\".",
      "{d} on the bike. Somewhere a car is jealous of your mileage.",
    ],
    any: [
      "{d} of pedaling. The bike did none of the work and still wants credit.",
      "{t} of turning the cranks. Watts delivered, ego intact.",
      "{d} on two wheels. Draft this, world.",
    ],
  },
  swim: {
    long: [
      "{d} in the water. That's a lot of quality time with a black line. Respect.",
      "{t} of swimming. You are now roughly 12% fish.",
    ],
    any: [
      "{d} in the pool. The lane rope has been informed of your excellence.",
      "{d} of swimming. Gills pending, effort confirmed.",
      "{t} in the water. The ducks are taking notes.",
    ],
  },
  strength: {
    long: ["{t} of lifting heavy things and putting them back. Gravity 0, you 1."],
    any: [
      "Strength session done. The weights are back on the rack and you're a little more unbreakable.",
      "{t} of strength work. Your muscles filed a request for building materials.",
      "Lift: complete. The barbell would like you to know it's impressed.",
    ],
  },
  other: {
    long: ["{t} of work. That's commitment, and your future self noticed."],
    any: ["{t} of training in the bank. Future you just sent a thank-you note.", "Session done: {t} of showing up. That's the whole secret."],
  },
};

const TITLES = ["Protein o'clock 🥚", "Refuel window is open", "Recovery snack time 🥛", "Nice work. Now feed it."];
export const PROTEIN_LINE = "Grab about 30 g of protein in the next 30 minutes: a shake, Greek yogurt, eggs, or a turkey sandwich all work.";

/** Same activity, same message: picked by a hash of its id. */
function pick<T>(list: T[], seed: string, salt: number): T {
  let h = salt;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function nudgeMessage(a: NudgeActivity, units: "mi" | "km"): { title: string; body: string } {
  const kind = kindOf(a.sport);
  const secs = a.duration_s ?? 0;
  const t = duration(secs);
  const d = distance(kind, a.distance_m, units) ?? t;
  const long = secs >= (kind === "swim" || kind === "strength" ? 60 : 90) * 60;
  const pool = long ? [...LINES[kind].long, ...LINES[kind].any] : LINES[kind].any;
  const line = pick(pool, a.id, 7).replaceAll("{d}", d).replaceAll("{t}", t);
  return { title: pick(TITLES, a.id, 3), body: `${line} ${PROTEIN_LINE}` };
}
