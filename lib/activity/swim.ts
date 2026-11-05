// Swim analysis: pool unit, per-rep splits (pace per 100, rest, SWOLF) from the watch's laps.
// Pure, so it runs in tests and on either side.
import { YARD, type PoolUnit } from "../workouts/garmin-format.ts";
import type { Lap, Streams } from "./fit.ts";
import type { Units } from "./format.ts";

export const SWIM = /swim/i;
export const isSwim = (sport: string | null | undefined) => SWIM.test(sport ?? "");

export type SwimPool = { unit: PoolUnit; length_m: number | null };

const near = (meters: number, length: number) => {
  const r = meters / length;
  return Math.abs(r - Math.round(r)) * length < 0.3 && Math.round(r) >= 1;
};

/**
 * The pool as the watch recorded it; for older syncs, yards vs meters from the lap distances
 * (25 yd = 22.86 m, so a mix of whole yard lengths can't be whole meter lengths), then the
 * viewer's units (miles -> yards) as the last resort, which is also what open water uses.
 */
export function swimPool(streams: Streams | null, laps: Lap[], total: number | null, u: Units): SwimPool {
  if (streams?.pool) return streams.pool;
  const dists = laps.map((l) => l.distance_m).filter((d): d is number => !!d && d > 0);
  if (!dists.length && total) dists.push(total);
  if (dists.length) {
    if (dists.every((d) => near(d, 25 * YARD))) return { unit: "YARD", length_m: null };
    if (dists.every((d) => near(d, 25))) return { unit: "METER", length_m: null };
  }
  return { unit: u === "mi" ? "YARD" : "METER", length_m: null };
}

const per100 = (unit: PoolUnit) => (unit === "YARD" ? 100 * YARD : 100);
export const unitLabel = (unit: PoolUnit) => (unit === "YARD" ? "yd" : "m");

/** 1:28 or 1:28.6 (tenths for splits, the way swim coaches read them). */
export function swimClock(sec: number, tenths = false) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = tenths ? s.toFixed(1).padStart(4, "0") : String(Math.round(s)).padStart(2, "0");
  return ss === "60" || ss === "60.0" ? `${m + 1}:${tenths ? "00.0" : "00"}` : `${m}:${ss}`;
}

/** "1:29 /100yd" from m/s; null when not moving. */
export function swimPace(mps: number | null | undefined, unit: PoolUnit) {
  if (!mps || !Number.isFinite(mps) || mps < 0.1) return null;
  return `${swimClock(per100(unit) / mps)} /100${unitLabel(unit)}`;
}

/** "1,425 yd" / "1,300 m". */
export function swimDist(meters: number | null | undefined, unit: PoolUnit) {
  if (!meters || meters < 1) return null;
  const v = unit === "YARD" ? meters / YARD : meters;
  return `${Math.round(v).toLocaleString("en-US")} ${unitLabel(unit)}`;
}

const STROKE_NAMES: Record<string, string> = {
  freestyle: "Free",
  backstroke: "Back",
  breaststroke: "Breast",
  butterfly: "Fly",
  drill: "Drill",
  mixed: "IM / mixed",
  im: "IM",
};
export const strokeName = (s: string | null | undefined) => (s ? (STROKE_NAMES[s] ?? s.charAt(0).toUpperCase() + s.slice(1)) : null);

export type SwimRep = {
  n: number;
  distance_m: number;
  time_s: number;
  sec_per_100: number;
  rest_s: number | null; // until the next rep starts; null after the last one
  stroke: string | null;
  lengths: number | null;
  strokes_per_length: number | null;
  swolf: number | null;
  stroke_rate: number | null;
  avg_hr: number | null;
  max_hr: number | null;
};

export type SwimSummary = {
  reps: SwimRep[];
  swim_s: number;
  rest_s: number;
  distance_m: number;
  sec_per_100: number | null;
  best_100: number | null; // fastest rep pace per 100, reps of at least 100
  swolf: number | null;
  stroke_rate: number | null;
};

/**
 * Laps with distance are reps; rest laps and paused time between them become the rep's rest.
 * Rest is measured start-to-start so it holds whether the watch logged a rest lap or a pause.
 */
export function swimSummary(laps: Lap[], unit: PoolUnit, pool: SwimPool): SwimSummary | null {
  const swims = laps.filter((l) => (l.distance_m ?? 0) > 0 && (l.duration_s ?? 0) > 0);
  if (!swims.length) return null;
  const lengthM = pool.length_m;
  const reps: SwimRep[] = swims.map((l, i) => {
    const time = l.duration_s!;
    const dist = l.distance_m!;
    const next = swims[i + 1];
    const rest = next ? Math.max(0, next.start_s - (l.start_s + time)) : null;
    const lengths = l.lengths ?? (lengthM ? Math.round(dist / lengthM) : null);
    const spl = l.strokes && lengths ? l.strokes / lengths : null;
    return {
      n: i + 1,
      distance_m: dist,
      time_s: time,
      sec_per_100: (time / dist) * per100(unit),
      rest_s: rest !== null && rest >= 1 ? rest : rest === null ? null : 0,
      stroke: l.stroke ?? null,
      lengths,
      strokes_per_length: spl,
      swolf: spl && lengths ? Math.round(time / lengths + spl) : null,
      stroke_rate: l.avg_cadence ?? null,
      avg_hr: l.avg_hr,
      max_hr: l.max_hr,
    };
  });
  const swim_s = reps.reduce((a, r) => a + r.time_s, 0);
  const distance_m = reps.reduce((a, r) => a + r.distance_m, 0);
  const rest_s = reps.reduce((a, r) => a + (r.rest_s ?? 0), 0);
  const weighted = (key: "swolf" | "stroke_rate") => {
    const rs = reps.filter((r) => r[key]);
    const t = rs.reduce((a, r) => a + r.time_s, 0);
    return t ? Math.round(rs.reduce((a, r) => a + r[key]! * r.time_s, 0) / t) : null;
  };
  const long = reps.filter((r) => r.distance_m >= per100(unit) - 1);
  return {
    reps,
    swim_s,
    rest_s,
    distance_m,
    sec_per_100: distance_m ? (swim_s / distance_m) * per100(unit) : null,
    best_100: long.length ? Math.min(...long.map((r) => r.sec_per_100)) : null,
    swolf: weighted("swolf"),
    stroke_rate: weighted("stroke_rate"),
  };
}
