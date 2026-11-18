// The mobility screen (2026-11-18): eight quick tests chosen for swim, bike and run, scored per side so
// left/right differences show. Pure, for tests. General guidance, not a medical assessment.
import { kindOf, moveBySlug, type Area, type RoutineItem } from "../recovery/catalog.ts";

export type Sport = "swim" | "bike" | "run";
export type Level = 0 | 1 | 2; // limited, fair, good
export type Choice = { level: Level; label: string };
export type Test = {
  id: string;
  name: string;
  short: string; // what it's about, in a few words
  clip: string; // SCREEN_CLIPS slug
  sided: boolean;
  how: string[];
  /** A number to measure (cm or seconds), or pick-the-picture choices. */
  measure: { unit: "cm" | "s"; max: number; fair: number; good: number } | { choices: Choice[] };
  areas: Area[]; // what the daily flow trains when this test is limited
  sports: Sport[];
  why: Partial<Record<Sport, string>>;
};

export const TESTS: Test[] = [
  {
    id: "ankle",
    name: "Knee to wall",
    short: "Ankle bend",
    clip: "screen-ankle",
    sided: true,
    how: [
      "Face a wall barefoot, one foot in front of the other.",
      "Keep the front heel down and push that knee forward to touch the wall.",
      "Slide the foot back until the knee only just touches. Measure from big toe to wall.",
    ],
    measure: { unit: "cm", max: 25, fair: 8, good: 12 },
    areas: ["ankles", "calves", "soleus"],
    sports: ["run"],
    why: { run: "A stiff ankle shortens your stride and loads the calf and Achilles." },
  },
  {
    id: "hip-flexor",
    name: "Couch hip extension",
    short: "Front of the hip",
    clip: "screen-hip-flexor",
    sided: true,
    how: [
      "Kneel with your back knee on a pad by a couch or wall, shin up against it, front foot planted.",
      "Squeeze the back glute and lift your chest as tall as you comfortably can.",
      "Pick what you can do.",
    ],
    measure: {
      choices: [
        { level: 0, label: "I have to keep my hands on the floor or front knee" },
        { level: 1, label: "I can sit up, but my torso leans forward" },
        { level: 2, label: "I can sit fully upright, glute squeezed" },
      ],
    },
    areas: ["hip flexors", "quads"],
    sports: ["run", "bike"],
    why: { run: "Tight hip flexors cut your stride short behind you.", bike: "Tight hip flexors make a low, closed position harder to hold." },
  },
  {
    id: "hamstring",
    name: "Active straight-leg raise",
    short: "Hamstrings",
    clip: "screen-hamstring",
    sided: true,
    how: [
      "Lie on your back, legs straight, toes up.",
      "Keeping both knees straight and the other leg flat, lift one leg as high as you can on its own.",
      "Where does the lifted ankle get to, compared with the other leg?",
    ],
    measure: {
      choices: [
        { level: 0, label: "Below the other knee" },
        { level: 1, label: "Between the knee and mid-thigh" },
        { level: 2, label: "Past mid-thigh" },
      ],
    },
    areas: ["hamstrings"],
    sports: ["bike", "run"],
    why: { bike: "Hamstring range lets you hinge into an aero position without rounding your back.", run: "Hamstring range keeps your stride easy at speed." },
  },
  {
    id: "hip-rotation",
    name: "90-90 hip rotation",
    short: "Hip rotation",
    clip: "screen-hip-rotation",
    sided: true,
    how: [
      "Sit with both knees bent at 90°: one leg in front, one out to the side behind you.",
      "Sit tall without your hands. The leg out behind you is the side you're testing.",
      "How close does that back knee get to the floor?",
    ],
    measure: {
      choices: [
        { level: 0, label: "Well off the floor, or I need my hands to stay up" },
        { level: 1, label: "Within a hand's width of the floor" },
        { level: 2, label: "On the floor while I sit tall" },
      ],
    },
    areas: ["hips", "glutes", "piriformis"],
    sports: ["run", "bike"],
    why: { run: "Stiff hips push the twist into your knees and low back.", bike: "Hip rotation keeps your knees tracking straight over the pedals." },
  },
  {
    id: "thoracic",
    name: "Seated rotation",
    short: "Mid-back turn",
    clip: "screen-thoracic",
    sided: true,
    how: [
      "Sit on the floor cross-legged or on a chair, a broomstick across your shoulders.",
      "Keep your hips still and turn your chest as far as you can.",
      "Where does the stick point?",
    ],
    measure: {
      choices: [
        { level: 0, label: "Less than halfway to the side wall" },
        { level: 1, label: "About halfway" },
        { level: 2, label: "Close to the side wall or past it" },
      ],
    },
    areas: ["upper back"],
    sports: ["swim", "bike"],
    why: { swim: "Rotation through your mid-back is how you breathe without crossing over.", bike: "A mobile mid-back lets your head and shoulders settle in aero." },
  },
  {
    id: "shoulder",
    name: "Wall reach overhead",
    short: "Shoulder reach",
    clip: "screen-shoulder",
    sided: true,
    how: [
      "Stand with heels, bottom, back and head against a wall, ribs down.",
      "Keeping your low back flat, raise one straight arm overhead, thumb leading.",
      "How close does your thumb get to the wall?",
    ],
    measure: {
      choices: [
        { level: 0, label: "More than a hand's width away, or my back arches" },
        { level: 1, label: "Within a hand's width" },
        { level: 2, label: "Touches the wall, back still flat" },
      ],
    },
    areas: ["shoulders", "upper back"],
    sports: ["swim"],
    why: { swim: "Full overhead reach is what gets you into a long, tight streamline." },
  },
  {
    id: "balance",
    name: "Single-leg balance, eyes closed",
    short: "Balance",
    clip: "screen-balance",
    sided: true,
    how: [
      "Barefoot, near a wall or counter in case you need it.",
      "Stand on one leg, arms crossed, and close your eyes.",
      "Count how many seconds until you open them, touch down or grab the wall. Stop at 30.",
    ],
    measure: { unit: "s", max: 30, fair: 10, good: 20 },
    areas: ["balance", "ankles", "foot arch"],
    sports: ["run"],
    why: { run: "Every running stride is a single-leg landing; better balance means steadier ankles and knees." },
  },
  {
    id: "squat",
    name: "Overhead deep squat",
    short: "Full squat",
    clip: "screen-squat",
    sided: false,
    how: [
      "Feet shoulder-width, arms straight overhead.",
      "Squat as deep as you can, heels down.",
      "Pick what happens.",
    ],
    measure: {
      choices: [
        { level: 0, label: "I can't get my thighs to parallel" },
        { level: 1, label: "I get low, but my heels lift or my arms drop forward" },
        { level: 2, label: "Hips below knees, heels down, arms overhead" },
      ],
    },
    areas: ["ankles", "hips", "upper back"],
    sports: ["run", "bike", "swim"],
    why: { run: "A full squat ties ankles, hips and back together; it shows where the chain is stiff." },
  },
];

export const testById = (id: string) => TESTS.find((t) => t.id === id) ?? null;

/** Raw answers: per test, a number (cm/s) or a choice level, for each side ("both" when not sided). */
export type Side = "left" | "right" | "both";
export type Answers = Record<string, Partial<Record<Side, number>>>;
export type Result = { id: string; sides: Partial<Record<Side, Level>>; worst: Level; uneven: boolean; raw: Partial<Record<Side, number>> };

export function levelFor(t: Test, value: number): Level {
  if ("choices" in t.measure) return (value >= 2 ? 2 : value >= 1 ? 1 : 0) as Level;
  return value >= t.measure.good ? 2 : value >= t.measure.fair ? 1 : 0;
}

/** Clean submitted answers: known tests, sensible numbers, every side filled. Returns null when incomplete. */
export function cleanAnswers(raw: unknown): Answers | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, Record<string, unknown>>;
  const out: Answers = {};
  for (const t of TESTS) {
    const sides: Side[] = t.sided ? ["left", "right"] : ["both"];
    const got: Partial<Record<Side, number>> = {};
    for (const s of sides) {
      const v = r[t.id]?.[s];
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      const max = "choices" in t.measure ? 2 : t.measure.max;
      got[s] = Math.min(Math.max("choices" in t.measure ? Math.round(v) : Math.round(v * 2) / 2, 0), max);
    }
    out[t.id] = got;
  }
  return out;
}

/** Uneven: a whole level apart, or, for measured tests, 25%+ and at least 2 units apart. */
export function score(a: Answers): Result[] {
  return TESTS.filter((t) => a[t.id]).map((t) => {
    const raw = a[t.id];
    const sides: Partial<Record<Side, Level>> = {};
    for (const [s, v] of Object.entries(raw) as [Side, number][]) sides[s] = levelFor(t, v);
    const levels = Object.values(sides) as Level[];
    let uneven = false;
    if (t.sided && raw.left !== undefined && raw.right !== undefined) {
      const [lo, hi] = [Math.min(raw.left, raw.right), Math.max(raw.left, raw.right)];
      uneven = "choices" in t.measure ? lo !== hi : hi - lo >= 2 && lo < hi * 0.75;
    }
    return { id: t.id, sides, worst: Math.min(...levels) as Level, uneven, raw };
  });
}

/** 0–100: the share of the best possible score, every side counted. */
export function overall(results: Result[]): number {
  const levels = results.flatMap((r) => Object.values(r.sides) as Level[]);
  return levels.length ? Math.round((levels.reduce<number>((t, l) => t + l, 0) / (levels.length * 2)) * 100) : 0;
}

/** The tighter side of an uneven sided result (lower raw value), else null. */
export const tighter = (r: Result): "left" | "right" | null =>
  r.uneven && r.raw.left !== undefined && r.raw.right !== undefined ? (r.raw.left < r.raw.right ? "left" : "right") : null;

export type Priority = { id: string; reason: string; level: Level; uneven: boolean };

/**
 * What to work on first: limited before fair, then uneven sides, then what matters most for the
 * athlete's sports (`mix`: share of training time per sport, any scale). At most three.
 */
export function priorities(results: Result[], mix: Partial<Record<Sport, number>> = {}): Priority[] {
  const total = Object.values(mix).reduce((t, v) => t + (v ?? 0), 0) || 1;
  const weight = (t: Test) => t.sports.reduce((w, s) => w + (mix[s] ?? 0) / total, 0);
  const top = (t: Test): Sport | null => t.sports.slice().sort((a, b) => (mix[b] ?? 0) - (mix[a] ?? 0))[0] ?? null;
  return results
    .filter((r) => r.worst < 2 || r.uneven)
    .map((r) => ({ r, t: testById(r.id)! }))
    .sort((a, b) => a.r.worst - b.r.worst || Number(b.r.uneven) - Number(a.r.uneven) || weight(b.t) - weight(a.t))
    .slice(0, 3)
    .map(({ r, t }) => {
      const sport = top(t);
      const side = tighter(r);
      const lead = side ? `Your ${side} side is tighter than your ${side === "left" ? "right" : "left"}.` : "";
      return { id: r.id, level: r.worst, uneven: r.uneven, reason: [lead, (sport && t.why[sport]) ?? Object.values(t.why)[0] ?? ""].filter(Boolean).join(" ") };
    });
}

/** What kind of day it is for mobility: before training, after it, or a day off. */
export type DayKind = "before" | "after" | "rest";

// Moves per area, best first. Dynamic moves suit before training; holds and rolling after or on rest days.
const FOR_AREA: Partial<Record<Area, string[]>> = {
  ankles: ["mobility-knee-to-wall", "stretch-deep-squat", "stretch-wall-calf-bent", "mobility-ankle-circles"],
  calves: ["mobility-knee-to-wall", "foam-roll-calves", "stretch-wall-calf-straight"],
  soleus: ["stretch-wall-calf-bent", "ball-soleus"],
  "hip flexors": ["mobility-lunge-reach", "mobility-worlds-greatest", "stretch-couch", "stretch-hip-flexor-lunge"],
  quads: ["stretch-couch", "foam-roll-quads"],
  hamstrings: ["mobility-hamstring-sweeps", "mobility-inchworm", "stretch-strap-hamstring", "foam-roll-hamstrings"],
  hips: ["mobility-90-90", "mobility-hip-cars", "stretch-pigeon", "stretch-figure-four"],
  glutes: ["mobility-90-90", "stretch-figure-four", "foam-roll-glutes"],
  piriformis: ["stretch-figure-four", "ball-glute-piriformis"],
  "upper back": ["mobility-thread-needle", "mobility-open-book", "mobility-cat-cow", "foam-roll-upper-back"],
  shoulders: ["mobility-wall-slides", "mobility-strap-pass", "stretch-wall-lat"],
  balance: ["balance-single-leg-reach", "balance-single-leg"],
  "foot arch": ["mobility-toe-yoga", "ball-foot-arch"],
};
const SUITS: Record<DayKind, string[]> = { before: ["dynamic", "balance"], after: ["hold", "roll", "dynamic"], rest: ["dynamic", "hold", "balance", "roll"] };
const TARGET_SEC: Record<DayKind, number> = { before: 6 * 60, after: 8 * 60, rest: 12 * 60 };
const GENERAL = ["mobility-cat-cow", "mobility-leg-swings", "mobility-90-90", "mobility-worlds-greatest"];

/**
 * Today's flow from the priorities: the right kind of moves for the day, a gentler version of held
 * positions where a test came out limited, no repeats, about the target length. Falls back to general moves when
 * nothing needs work.
 */
export function dailyFlow(pri: Priority[], day: DayKind): RoutineItem[] {
  const out: RoutineItem[] = [];
  const used = new Set<string>();
  const secs = (items: RoutineItem[]) => items.reduce((t, i) => t + (moveBySlug(i.slug)?.perSide ? i.seconds * 2 + 5 : i.seconds), 0);
  const add = (slug: string, gentle: boolean) => {
    let m = moveBySlug(slug);
    if (!m || !SUITS[day].includes(kindOf(m))) return false;
    if (gentle && m.easier && kindOf(m) === "hold") m = moveBySlug(m.easier) ?? m; // a held position that may be out of reach
    if (used.has(m.slug)) return false;
    used.add(m.slug);
    out.push({ slug: m.slug, seconds: day === "before" ? Math.min(m.seconds, 40) : m.seconds });
    return true;
  };
  // Round-robin: one move per priority, then a second each, until the time is used.
  const lists = pri.map((p) => ({ gentle: p.level === 0, slugs: testById(p.id)!.areas.flatMap((a) => FOR_AREA[a] ?? []) }));
  for (let round = 0; round < 4 && secs(out) < TARGET_SEC[day]; round++) {
    for (const l of lists) {
      if (secs(out) >= TARGET_SEC[day]) break;
      let picked = 0;
      for (const s of l.slugs) if (picked < 1 && add(s, l.gentle)) picked++;
    }
  }
  for (const s of GENERAL) if (secs(out) < TARGET_SEC[day] * 0.8) add(s, false);
  if (day === "rest") out.push({ slug: "breath-box", seconds: 120 }); // two calm minutes to finish a day off
  return out;
}

/** When to test again: about every five weeks. */
export const RETEST_DAYS = 35;
