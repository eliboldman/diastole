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
    for (const d of RUN_DISTANCES) {
      const s = fastestOver(streams.t, streams.dist, d.meters);
      // Ignore impossible values (GPS glitches): faster than ~1.6 min/km.
      if (s && s > d.meters * 0.095) out[d.key] = s;
    }
  }
  if (streams.power) {
    const p = bestAverage(streams.power, streams.interval_s, 1200);
    if (p && p < 700) out.power_20m = p;
  }
  return out;
}
