// The imported 70.3 Panama City Beach plan: its checkpoints and the "if training goes well" projection.
// Pure module (no server imports), testable with `node`.

export const PCB_PLAN_ID = "pcb-703-2027";
export const PCB_RACE_DATE = "2027-05-08";
export const PCB_START = "2026-11-16"; // Monday of plan week 1

const MI = 1609.344;
const YD = 0.9144;

/** Plan week (1-based; 0 = the days before week 1) for a date. */
export function planWeek(date: string): number {
  const d = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${PCB_START}T12:00:00Z`)) / 86_400_000;
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

// ---- projection (the plan's 3:55-lane curve, anchored on the zones the plan was loaded with on Nov 13)
// Values: FTP (W), run threshold (s/mi), CSS (s/100 yd).
// Plan v2 (14 Nov) builds base, speed and strength first and puts threshold work in
// W9-16, so FTP lands later: ~293 W at Checkpoint 1 (W8), still 315 W by Checkpoint 2 (W16).
export const PROJECTION_BASE = { ftp: 231, thr: 401, css: 90 };
const ANCHORS = {
  ftp: [[0, 231], [8, 293], [16, 315], [25, 315]],
  thr: [[0, 401], [8, 380], [16, 365], [21, 360], [25, 360]],
  css: [[0, 90], [8, 84], [16, 81], [21, 80], [25, 80]],
} as const;
const lerp = (pts: readonly (readonly [number, number])[], w: number) => {
  for (let i = 1; i < pts.length; i++)
    if (w <= pts[i][0]) {
      const [a, va] = pts[i - 1];
      const [b, vb] = pts[i];
      return va + ((vb - va) * (w - a)) / (b - a);
    }
  return pts[pts.length - 1][1];
};
export type Fitness = { ftp: number; thr: number; css: number };
export function projectedAt(week: number): Fitness {
  return { ftp: lerp(ANCHORS.ftp, week), thr: lerp(ANCHORS.thr, week), css: lerp(ANCHORS.css, week) };
}
/** App zones (athlete_zones columns) in the projection's units. */
export function fitnessFromZones(z: { ftp_w?: number | null; threshold_speed_mps?: number | null; css_sec_per_100m?: number | null }): Partial<Fitness> {
  return {
    ...(z.ftp_w ? { ftp: Number(z.ftp_w) } : {}),
    ...(z.threshold_speed_mps ? { thr: MI / Number(z.threshold_speed_mps) } : {}),
    ...(z.css_sec_per_100m ? { css: Number(z.css_sec_per_100m) * YD } : {}),
  };
}

// ---- race-equivalent finish at a given fitness (CdA 0.18, 86 kg system, Crr 0.0035, warm sea-level air)
function bikeSpeed(watts: number) {
  let v = 10;
  for (let i = 0; i < 60; i++) {
    const f = 0.5 * 1.18 * 0.18 * v ** 3 + 0.0035 * 86 * 9.81 * v - watts * 0.975;
    const d = 1.5 * 1.18 * 0.18 * v * v + 0.0035 * 86 * 9.81;
    v -= f / d;
  }
  return v;
}
export function raceEstimate(f: Fitness) {
  const swim = (f.css - 1.5) * 21.12; // 1.2 mi = 2112 yd, wetsuit ~1.5 s/100 faster than CSS
  const watts = f.ftp * 0.77;
  const mps = bikeSpeed(watts);
  const bike = (56 * MI) / mps;
  const runPace = f.thr * 1.045;
  const run = runPace * 13.1094;
  return { swim, bike, run, total: swim + bike + run + 180, watts, mph: mps * 2.23694, runPace };
}

// ---- checkpoints (plan section 4)
export type Lane = "3:55" | "4:05" | "below";
export type MetricKey = "ftp" | "thr" | "css" | "run10k" | "simMph" | "simIf" | "simRunPace";
export type Metric = { key: MetricKey; label: string; better: "higher" | "lower"; lane355: number; lane405: number };
/** `progressOnly`: a progress check, not a lane decision. It's scored and reported, but never offers a goal-pace reset. */
export type Checkpoint = { n: 1 | 2 | 3; label: string; from: string; to: string; metrics: Metric[]; progressOnly?: boolean };

export const CHECKPOINTS: Checkpoint[] = [
  {
    // Plan v2: a progress check. "3:55" here means on track for it, "4:05" a little behind.
    n: 1, label: "Checkpoint 1", from: "2027-01-04", to: "2027-01-10", progressOnly: true,
    metrics: [
      { key: "ftp", label: "FTP", better: "higher", lane355: 290, lane405: 278 },
      { key: "thr", label: "30-min run TT pace", better: "lower", lane355: 375, lane405: 390 },
      { key: "css", label: "CSS", better: "lower", lane355: 84, lane405: 87 },
    ],
  },
  {
    n: 2, label: "Checkpoint 2", from: "2027-03-01", to: "2027-03-07",
    metrics: [
      { key: "ftp", label: "FTP", better: "higher", lane355: 315, lane405: 300 },
      { key: "run10k", label: "Solo 10K", better: "lower", lane355: 36 * 60 + 15, lane405: 38 * 60 },
      { key: "css", label: "CSS", better: "lower", lane355: 81, lane405: 84 },
    ],
  },
  {
    n: 3, label: "Checkpoint 3 (race simulation)", from: "2027-04-11", to: "2027-04-11",
    metrics: [
      { key: "simMph", label: "56 mi bike speed", better: "higher", lane355: 27.5, lane405: 27.0 },
      { key: "simIf", label: "Bike intensity (IF)", better: "lower", lane355: 0.78, lane405: 0.8 },
      { key: "simRunPace", label: "6 mi off the bike", better: "lower", lane355: 376, lane405: 400 },
    ],
  },
];

export function laneFor(m: Metric, value: number): Lane {
  const ok = (target: number) => (m.better === "higher" ? value >= target : value <= target);
  return ok(m.lane355) ? "3:55" : ok(m.lane405) ? "4:05" : "below";
}
const RANK: Record<Lane, number> = { "3:55": 0, "4:05": 1, below: 2 };
/** The checkpoint's lane: the weakest measured metric decides. */
export function overallLane(lanes: Lane[]): Lane | null {
  if (!lanes.length) return null;
  return lanes.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

/** How a checkpoint result reads: lanes for decision checkpoints, on-track wording for a progress check. */
export function laneText(cp: Pick<Checkpoint, "progressOnly">, lane: Lane): string {
  if (cp.progressOnly) return lane === "3:55" ? "on track for 3:55" : lane === "4:05" ? "a little behind, nothing to change yet" : "behind; worth a look at the last few weeks";
  return lane === "below" ? "below the 4:05 lane" : `${lane} lane`;
}

/** Goal race pace (s/mi, [fast, slow]) for a lane, used when resetting the fixed race-pace steps. */
export const LANE_RUN_PACE: Record<Exclude<Lane, "below">, [number, number]> = { "3:55": [374, 380], "4:05": [400, 406] };

export const fmtClock = (s: number) => {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};
export function metricText(key: MetricKey, v: number): string {
  if (key === "ftp") return `${Math.round(v)} W`;
  if (key === "thr" || key === "simRunPace") return `${fmtClock(v)}/mi`;
  if (key === "css") return `${fmtClock(v)}/100 yd`;
  if (key === "run10k") return fmtClock(v);
  if (key === "simMph") return `${v.toFixed(1)} mph`;
  return v.toFixed(2);
}
