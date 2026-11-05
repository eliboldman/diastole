// Pain spots for the post-workout check-in: left/right body areas and joints, 1 mild .. 3 severe.
// Never shared with pods; the athlete and their coach only.

const SIDED = ["shoulder", "elbow", "wrist", "hip", "groin", "quad", "hamstring", "knee", "shin", "calf", "ankle", "foot"] as const;
const CENTER = ["neck", "upper_back", "lower_back", "chest", "abs"] as const;
export type Spot = (typeof CENTER)[number] | `${(typeof SIDED)[number]}_${"l" | "r"}`;
export const SPOTS: Spot[] = [...CENTER, ...SIDED.flatMap((s) => [`${s}_l`, `${s}_r`] as Spot[])];
export type PainLevel = 1 | 2 | 3;
export type Pain = Partial<Record<Spot, PainLevel>>;

const NAME: Record<string, string> = {
  neck: "Neck",
  upper_back: "Upper back",
  lower_back: "Lower back",
  chest: "Chest",
  abs: "Abs",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist: "wrist / hand",
  hip: "hip",
  groin: "groin",
  quad: "quad",
  hamstring: "hamstring",
  knee: "knee",
  shin: "shin",
  calf: "calf / Achilles",
  ankle: "ankle",
  foot: "foot",
};
export function spotLabel(s: Spot) {
  const m = /^(.*)_(l|r)$/.exec(s);
  if (!m || !(m[1] in NAME) || CENTER.includes(s as (typeof CENTER)[number])) return NAME[s] ?? s;
  return `${m[2] === "l" ? "Left" : "Right"} ${NAME[m[1]]}`;
}
export const PAIN_LABEL: Record<PainLevel, string> = { 1: "Mild", 2: "Moderate", 3: "Severe" };
export const PAIN_COLOR: Record<PainLevel, string> = { 1: "#fda4af", 2: "#fb7185", 3: "#e11d48" };

const isSpot = (k: string): k is Spot => (SPOTS as string[]).includes(k);
export function normalizePain(raw: unknown): Pain {
  const out: Pain = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isSpot(k) && (v === 1 || v === 2 || v === 3)) out[k] = v;
  return out;
}
export function cyclePain(p: Pain, s: Spot): Pain {
  const next = { ...p };
  const cur = p[s] ?? 0;
  if (cur >= 3) delete next[s];
  else next[s] = (cur + 1) as PainLevel;
  return next;
}

export const FEEL = [
  { v: 1, emoji: "😫", label: "Awful" },
  { v: 2, emoji: "😕", label: "Rough" },
  { v: 3, emoji: "😐", label: "Okay" },
  { v: 4, emoji: "🙂", label: "Good" },
  { v: 5, emoji: "😄", label: "Great" },
] as const;

// Borg CR10, in plain words.
export const RPE_LABEL: Record<number, string> = {
  1: "Very easy",
  2: "Easy",
  3: "Moderate",
  4: "Somewhat hard",
  5: "Hard",
  6: "Hard",
  7: "Very hard",
  8: "Very hard",
  9: "Extremely hard",
  10: "Max effort",
};

/** Session RPE load: effort x minutes (Foster's sRPE). */
export const sessionLoad = (rpe: number | null | undefined, durationS: number | null | undefined) =>
  rpe && durationS ? Math.round(rpe * (durationS / 60)) : null;
