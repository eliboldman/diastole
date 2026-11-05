// Best efforts inside one workout, from its resampled streams: fastest time over standard run
// distances and best 20-minute power. Pure, for tests and the server.
import type { Streams } from "./fit.ts";

export const RUN_DISTANCES = [
  { key: "run_1mi", meters: 1609.344, label: "Mile" },
  { key: "run_5k", meters: 5000, label: "5K" },
  { key: "run_10k", meters: 10000, label: "10K" },
  { key: "run_half", meters: 21097.5, label: "Half marathon" },
] as const;

export type Bests = Partial<Record<(typeof RUN_DISTANCES)[number]["key"] | "power_20m", number>>;

const RUN = /run|treadmill|track|trail/i;

// No human runs a sustained 5-second step faster than this (~2:13/km); faster means GPS trouble.
const MAX_STEP_MPS = 7.5;

/**
 * Cumulative distance with GPS glitches taken out: drops (resets) count as no distance, and a step
 * faster than a sprint is replaced by that moment's measured speed (or nothing). Without this, a GPS
 * catch-up after a dropout shows up as an impossible "fastest mile".
 */
export function cleanDistance(t: number[], dist: (number | null)[], speed?: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = new Array(t.length).fill(null);
  let total = 0;
  let prevT: number | null = null;
  let prevD: number | null = null;
  for (let i = 0; i < t.length; i++) {
    const d = dist[i];
    if (d === null || d === undefined) continue;
    if (prevD !== null && prevT !== null) {
      const dt = t[i] - prevT;
      let dd = d - prevD;
      if (dd < 0) dd = 0;
      if (dt > 0 && dd / dt > MAX_STEP_MPS) {
        const v = speed?.[i];
        dd = v !== null && v !== undefined && v > 0 && v <= MAX_STEP_MPS ? v * dt : 0;
      }
      total += dd;
    }
    out[i] = total;
    prevT = t[i];
    prevD = d;
  }
  return out;
}

/** Shortest time (s) to cover `meters` anywhere in the workout, from cumulative distance samples. */
export function fastestOver(t: number[], dist: (number | null)[], meters: number): number | null {
  const pts: [number, number][] = [];
  for (let i = 0; i < t.length; i++) if (dist[i] !== null && dist[i] !== undefined) pts.push([t[i], dist[i]!]);
  if (pts.length < 2 || pts.at(-1)![1] - pts[0][1] < meters) return null;
  let best = Infinity;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    // Move the start forward while the window still covers the distance.
    while (j < i && pts[i][1] - pts[j + 1][1] >= meters) j++;
    if (pts[i][1] - pts[j][1] >= meters) {
      // Interpolate where exactly the distance was reached to avoid sample-size bias.
      const over = pts[i][1] - pts[j][1] - meters;
      const segD = pts[i][1] - pts[i - 1][1];
      const segT = pts[i][0] - pts[i - 1][0];
      const trim = segD > 0 ? (over / segD) * segT : 0;
      best = Math.min(best, pts[i][0] - pts[j][0] - trim);
    }
  }
  return Number.isFinite(best) && best > 0 ? Math.round(best) : null;
}

/** Highest average power over a window (missing samples count as zero: coasting). */
export function bestAverage(values: (number | null)[], intervalS: number, windowS: number): number | null {
  const n = Math.round(windowS / intervalS);
  if (n < 1 || values.length < n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i] ?? 0;
  let best = sum;
  for (let i = n; i < values.length; i++) {
    sum += (values[i] ?? 0) - (values[i - n] ?? 0);
    best = Math.max(best, sum);
  }
  return best > 0 ? Math.round(best / n) : null;
}

export function bestsOf(streams: Streams | null | undefined, sport: string | null | undefined): Bests {
  const out: Bests = {};
  if (!streams?.t?.length) return out;
  if (RUN.test(sport ?? "") && streams.dist) {
    const dist = cleanDistance(streams.t, streams.dist, streams.speed);
    const covered = dist.filter((x): x is number => x !== null);
    const span = streams.t.at(-1)! - streams.t[0];
    const avg = covered.length && span > 0 ? covered.at(-1)! / span : 0;
    for (const d of RUN_DISTANCES) {
      const s = fastestOver(streams.t, dist, d.meters);
      if (!s) continue;
      const v = d.meters / s;
      // Sanity: no faster than world-record pace for the distance, and no more than 1.7x this run's
      // own average (intervals fit; a GPS catch-up doesn't).
      const worldBest = d.meters <= 1700 ? 7.3 : d.meters <= 5100 ? 6.65 : d.meters <= 10100 ? 6.35 : 6.1;
      if (v <= worldBest && (!avg || v <= avg * 1.7)) out[d.key] = s;
    }
  }
  if (streams.power) {
    const p = bestAverage(streams.power, streams.interval_s, 1200);
    if (p && p < 700) out.power_20m = p;
  }
  return out;
}
