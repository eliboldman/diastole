// Training zones and time-in-zone. Pure module (testable with `node`).
// Five zones everywhere so HR, pace and power read the same way.

export type ZoneKind = "hr" | "pace" | "power";
export type Zone = { n: 1 | 2 | 3 | 4 | 5; name: string; low: number | null; high: number | null };

/** % of max HR (Garmin's default zones). */
const HR_PCT = [0.5, 0.6, 0.7, 0.8, 0.9];
/** % of threshold running speed. */
const PACE_PCT = [0.78, 0.88, 0.95, 1.02];
/** % of FTP (Coggan, with VO2 and above folded into zone 5). */
const POWER_PCT = [0.55, 0.75, 0.9, 1.05];

const NAMES: Record<ZoneKind, string[]> = {
  hr: ["Warm up", "Easy", "Aerobic", "Threshold", "Maximum"],
  pace: ["Easy", "Steady", "Tempo", "Threshold", "Speed"],
  power: ["Recovery", "Endurance", "Tempo", "Threshold", "VO2 and above"],
};

function build(kind: ZoneKind, edges: number[]): Zone[] {
  // edges: the 4 boundaries between zones 1-2, 2-3, 3-4, 4-5
  return NAMES[kind].map((name, i) => ({
    n: (i + 1) as Zone["n"],
    name,
    low: i === 0 ? null : edges[i - 1],
    high: i === 4 ? null : edges[i],
  }));
}

export function hrZones(maxHr: number): Zone[] {
  return build("hr", HR_PCT.slice(1).map((p) => Math.round(p * maxHr)));
}
/** Pace zones expressed as speed (m/s); higher is faster. */
export function paceZones(thresholdSpeed: number): Zone[] {
  return build("pace", PACE_PCT.map((p) => Number((p * thresholdSpeed).toFixed(3))));
}
export function powerZones(ftp: number): Zone[] {
  return build("power", POWER_PCT.map((p) => Math.round(p * ftp)));
}

export function zoneOf(zones: Zone[], v: number): Zone {
  return zones.find((z) => (z.low === null || v >= z.low) && (z.high === null || v < z.high)) ?? zones[0];
}

/** Seconds spent in each zone, from a resampled stream. Gaps (null) are skipped. */
export function timeInZones(zones: Zone[], values: (number | null)[] | undefined, intervalS: number, minValue = 0) {
  const secs = zones.map(() => 0);
  for (const v of values ?? []) {
    if (v === null || v <= minValue) continue;
    secs[zoneOf(zones, v).n - 1] += intervalS;
  }
  return secs;
}

/**
 * Max HR when the coach hasn't set one: the highest reliable reading from recent activities,
 * nudged up because few sessions reach a true maximum. Null without enough data.
 */
export function estimateMaxHr(recentMaxes: (number | null)[]): number | null {
  const valid = recentMaxes.filter((v): v is number => v !== null && v >= 120 && v <= 230).sort((a, b) => b - a);
  if (valid.length < 3) return null;
  // Second-highest guards against a single strap glitch.
  return Math.min(230, Math.round(valid[1] * 1.02));
}

/** ISO timestamp n days back, for "recent activities" queries (server-rendered per request). */
export function daysBackIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
