// Muscles worked: which body regions a workout strained and how much (1 light, 2 moderate, 3 hard).
// Estimated from the workout's demands (sport pattern x load) or from logged strength sets; the
// athlete can override it. Pure: used by the server, the client editor and tests.

export const REGIONS = [
  "traps",
  "shoulders",
  "chest",
  "upper_back",
  "lats",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "lower_back",
  "hip_flexors",
  "glutes",
  "adductors",
  "quads",
  "hamstrings",
  "calves",
  "shins",
] as const;
export type Region = (typeof REGIONS)[number];
export type Level = 1 | 2 | 3;
export type Strain = Partial<Record<Region, Level>>;

export const REGION_LABEL: Record<Region, string> = {
  traps: "Traps",
  shoulders: "Shoulders",
  chest: "Chest",
  upper_back: "Upper back",
  lats: "Lats",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  lower_back: "Lower back",
  hip_flexors: "Hip flexors",
  glutes: "Glutes",
  adductors: "Adductors",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  shins: "Shins",
};
export const LEVEL_LABEL: Record<Level, string> = { 1: "Light", 2: "Moderate", 3: "Hard" };

const isRegion = (k: string): k is Region => (REGIONS as readonly string[]).includes(k);

/** Any stored JSON -> a valid strain map. */
export function normalizeStrain(raw: unknown): Strain {
  const out: Strain = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isRegion(k) && (v === 1 || v === 2 || v === 3)) out[k] = v;
  }
  return out;
}

/** Tap cycle: none -> light -> moderate -> hard -> none. */
export function cycle(s: Strain, r: Region): Strain {
  const next = { ...s };
  const cur = s[r] ?? 0;
  if (cur >= 3) delete next[r];
  else next[r] = (cur + 1) as Level;
  return next;
}

// ---------------------------------------------------------------- endurance estimate

type Weights = Partial<Record<Region, number>>;

// How much of a session's demand each region carries, per sport (0..1).
const PATTERN: Record<string, Weights> = {
  run: { calves: 1, quads: 0.85, hamstrings: 0.75, glutes: 0.75, hip_flexors: 0.42, shins: 0.5, adductors: 0.3, abs: 0.3, lower_back: 0.25 },
  bike: { quads: 1, glutes: 0.8, hamstrings: 0.55, calves: 0.45, hip_flexors: 0.4, lower_back: 0.35, forearms: 0.15, shoulders: 0.1 },
  swim: { lats: 1, shoulders: 1, triceps: 0.7, upper_back: 0.65, chest: 0.55, abs: 0.4, forearms: 0.35, obliques: 0.3, glutes: 0.2, quads: 0.2, calves: 0.15 },
  walk: { calves: 0.65, quads: 0.5, glutes: 0.5, hamstrings: 0.35, shins: 0.3, lower_back: 0.15 },
  hike: { quads: 0.85, glutes: 0.8, calves: 0.75, hamstrings: 0.5, lower_back: 0.35, shins: 0.35, traps: 0.2, abs: 0.2 },
  row: { lats: 1, upper_back: 0.9, quads: 0.8, glutes: 0.7, biceps: 0.6, lower_back: 0.55, forearms: 0.5, hamstrings: 0.45, shoulders: 0.4, abs: 0.35 },
  ski: { quads: 1, glutes: 0.8, adductors: 0.6, hamstrings: 0.5, calves: 0.4, abs: 0.4, lower_back: 0.35 },
  nordic: { lats: 0.8, triceps: 0.8, shoulders: 0.6, quads: 0.7, glutes: 0.7, calves: 0.5, abs: 0.45 },
  paddle: { lats: 0.9, shoulders: 0.9, obliques: 0.8, upper_back: 0.7, biceps: 0.5, forearms: 0.5, abs: 0.5 },
  yoga: { hamstrings: 0.45, hip_flexors: 0.45, shoulders: 0.35, abs: 0.35, glutes: 0.3, lower_back: 0.3, adductors: 0.3, calves: 0.2 },
  elliptical: { quads: 0.8, glutes: 0.7, hamstrings: 0.5, calves: 0.5, shoulders: 0.2, biceps: 0.15 },
  climb: { forearms: 1, lats: 0.9, biceps: 0.85, upper_back: 0.7, shoulders: 0.6, abs: 0.5, calves: 0.3 },
};

function patternFor(sport: string, subSport?: string | null): Weights | null {
  const s = `${sport} ${subSport ?? ""}`.toLowerCase();
  if (/swim/.test(s)) return PATTERN.swim;
  if (/run|treadmill|track/.test(s)) return PATTERN.run;
  if (/cycl|bik|ride|spin/.test(s)) return PATTERN.bike;
  if (/hik|mountaineer/.test(s)) return PATTERN.hike;
  if (/walk/.test(s)) return PATTERN.walk;
  if (/row/.test(s)) return PATTERN.row;
  if (/cross_country|nordic|classic|skate/.test(s)) return PATTERN.nordic;
  if (/ski|snowboard/.test(s)) return PATTERN.ski;
  if (/paddl|kayak|canoe|sup/.test(s)) return PATTERN.paddle;
  if (/yoga|pilates|stretch|mobility/.test(s)) return PATTERN.yoga;
  if (/elliptical|stair|stepper/.test(s)) return PATTERN.elliptical;
  if (/climb|boulder/.test(s)) return PATTERN.climb;
  return null;
}

export type Demand = {
  sport: string | null;
  sub_sport?: string | null;
  duration_s: number | null;
  distance_m?: number | null;
  elevation_gain_m?: number | null;
  avg_hr?: number | null;
  max_hr_athlete?: number | null; // the athlete's max (coach-set or estimated)
  training_load?: number | null; // Garmin's, when present
  swim_stroke?: string | null; // dominant stroke
};

/** 0..1: how demanding the session was overall. */
export function demandScore(d: Demand): number {
  if (d.training_load && d.training_load > 0) return Math.min(1, d.training_load / 170);
  const min = (d.duration_s ?? 0) / 60;
  if (!min) return 0;
  // Heart-rate intensity when known (TRIMP-like), otherwise a moderate default.
  const ratio = d.avg_hr && d.max_hr_athlete ? Math.min(1, d.avg_hr / d.max_hr_athlete) : 0.72;
  const load = min * Math.pow(Math.max(0, ratio - 0.5) / 0.5, 2) * 2; // ~60 min at threshold ~ 75
  return Math.min(1, load / 110);
}

const toLevel = (x: number): Level | null => (x >= 0.62 ? 3 : x >= 0.36 ? 2 : x >= 0.14 ? 1 : null);

/** Estimate from the sport's pattern scaled by demand; terrain and stroke shift the pattern. */
export function estimateStrain(d: Demand): Strain {
  const base = patternFor(d.sport ?? "", d.sub_sport);
  if (!base) return {};
  const w: Weights = { ...base };
  const sport = `${d.sport ?? ""}`.toLowerCase();
  // Climbing: more glutes, calves and lower back (runs and hikes); more glutes/lower back on rides.
  const climbRate = d.distance_m && d.elevation_gain_m ? d.elevation_gain_m / (d.distance_m / 1000) : 0;
  if (climbRate > 15) {
    const k = Math.min(1, (climbRate - 15) / 35);
    for (const r of ["glutes", "calves", "lower_back"] as Region[]) w[r] = Math.min(1, (w[r] ?? 0) + 0.25 * k);
  }
  if (/swim/.test(sport) && d.swim_stroke) {
    const st = d.swim_stroke.toLowerCase();
    if (st.includes("breast")) Object.assign(w, { adductors: 0.8, quads: 0.6, hamstrings: 0.4, chest: 0.7 });
    if (st.includes("fly") || st.includes("butterfly")) Object.assign(w, { abs: 0.8, lower_back: 0.7, chest: 0.8 });
    if (st.includes("back")) Object.assign(w, { upper_back: 0.8, chest: 0.35 });
  }
  const demand = demandScore(d);
  const out: Strain = {};
  for (const [r, v] of Object.entries(w) as [Region, number][]) {
    const lvl = toLevel(v * (0.35 + demand * 0.9));
    if (lvl) out[r] = lvl;
  }
  return out;
}

// ---------------------------------------------------------------- strength sets (from the watch file)

export type StrengthSet = { category: string | null; reps?: number | null; weight?: number | null; duration_s?: number | null };

// FIT exercise categories -> regions (primary 1, secondary 0.5).
const CATEGORY: Record<string, Weights> = {
  bench_press: { chest: 1, triceps: 0.6, shoulders: 0.5 },
  push_up: { chest: 1, triceps: 0.6, shoulders: 0.5, abs: 0.3 },
  flye: { chest: 1, shoulders: 0.4 },
  shoulder_press: { shoulders: 1, triceps: 0.6, traps: 0.3 },
  lateral_raise: { shoulders: 1, traps: 0.3 },
  shoulder_stability: { shoulders: 0.8, upper_back: 0.5 },
  shrug: { traps: 1, forearms: 0.4 },
  row: { upper_back: 1, lats: 0.8, biceps: 0.6, forearms: 0.3 },
  pull_up: { lats: 1, biceps: 0.7, upper_back: 0.6, forearms: 0.5 },
  curl: { biceps: 1, forearms: 0.6 },
  triceps_extension: { triceps: 1 },
  deadlift: { hamstrings: 1, glutes: 1, lower_back: 0.9, traps: 0.5, forearms: 0.5, quads: 0.4 },
  squat: { quads: 1, glutes: 0.9, adductors: 0.5, hamstrings: 0.4, lower_back: 0.3 },
  lunge: { quads: 1, glutes: 0.9, adductors: 0.4, hamstrings: 0.4, calves: 0.2 },
  leg_curl: { hamstrings: 1, calves: 0.3 },
  calf_raise: { calves: 1 },
  hip_raise: { glutes: 1, hamstrings: 0.6 },
  hip_stability: { glutes: 0.8, adductors: 0.6, hip_flexors: 0.4 },
  hip_swing: { glutes: 0.9, hamstrings: 0.8, lower_back: 0.5, forearms: 0.3 },
  hyperextension: { lower_back: 1, glutes: 0.6, hamstrings: 0.5 },
  leg_raise: { abs: 0.9, hip_flexors: 0.9 },
  crunch: { abs: 1, obliques: 0.4 },
  sit_up: { abs: 1, hip_flexors: 0.6 },
  core: { abs: 1, obliques: 0.7, lower_back: 0.4 },
  plank: { abs: 1, obliques: 0.6, shoulders: 0.4 },
  chop: { obliques: 1, abs: 0.6, shoulders: 0.4 },
  carry: { forearms: 1, traps: 0.8, abs: 0.5, obliques: 0.5 },
  olympic_lift: { quads: 0.9, glutes: 0.9, hamstrings: 0.7, traps: 0.8, shoulders: 0.6, lower_back: 0.6 },
  plyo: { calves: 0.9, quads: 0.9, glutes: 0.7 },
  total_body: { quads: 0.6, glutes: 0.6, chest: 0.5, shoulders: 0.5, abs: 0.5, lats: 0.4 },
  battle_rope: { shoulders: 1, forearms: 0.7, abs: 0.5 },
  sled: { quads: 1, glutes: 0.9, calves: 0.6 },
};

/** From logged sets: regions shade up with the number of sets that hit them (like a training log). */
export function strainFromSets(sets: StrengthSet[]): Strain {
  const score: Partial<Record<Region, number>> = {};
  for (const s of sets) {
    const w = s.category ? CATEGORY[s.category] : undefined;
    if (!w) continue;
    for (const [r, v] of Object.entries(w) as [Region, number][]) score[r] = (score[r] ?? 0) + v;
  }
  const out: Strain = {};
  for (const [r, v] of Object.entries(score) as [Region, number][]) {
    const lvl: Level | null = v >= 6 ? 3 : v >= 3 ? 2 : v >= 1 ? 1 : null;
    if (lvl) out[r] = lvl;
  }
  return out;
}

// ---------------------------------------------------------------- recovery (the avatar)

/** The last few days' strain, fading as it ages (today full, 2 days ago faint). */
export function recentStrain(rows: { strain: Strain; at: string }[], now = Date.now()): Strain {
  const score: Partial<Record<Region, number>> = {};
  for (const row of rows) {
    const h = (now - Date.parse(row.at)) / 3_600_000;
    const decay = h < 24 ? 1 : h < 48 ? 0.6 : h < 72 ? 0.3 : 0;
    if (!decay) continue;
    for (const [r, lvl] of Object.entries(row.strain) as [Region, Level][]) score[r] = Math.max(score[r] ?? 0, lvl * decay);
  }
  const out: Strain = {};
  for (const [r, v] of Object.entries(score) as [Region, number][]) {
    const lvl: Level | null = v >= 2.5 ? 3 : v >= 1.5 ? 2 : v >= 0.6 ? 1 : null;
    if (lvl) out[r] = lvl;
  }
  return out;
}
