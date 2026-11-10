// A workout at a glance: total time and total distance from its steps, plus a short line saying
// what it is ("5 × 3:00 · 12 min hard"). Shown at the top of every workout and live in the builder.
// Pure module (type imports only) so it can be tested directly with `node`.
//
// Exact when the steps say so (time steps give time, distance steps give distance). The other half
// is estimated from the step's pace target, then the athlete's threshold, then an easy default,
// and marked "~". "Until lap" steps can't be counted and are reported separately.

import { inferPool, type Pool, type Sport, type Step, type Target } from "./garmin-format.ts";

const YARD = 0.9144;
const MILE = 1609.344;

export type Zones = { threshold_speed_mps?: number | null; ftp_w?: number | null } | null;

export type Totals = {
  seconds: number;
  meters: number;
  timeEstimated: boolean; // some of the time comes from a distance at an estimated speed
  distanceEstimated: boolean; // some of the distance comes from a time at an estimated speed
  openSteps: number; // "until lap" steps, not in either total
  hardSeconds: number;
};

const DEFAULT_SPEED: Record<string, number> = { run: 2.9, bike: 7.5, swim: 0.75 }; // m/s, easy

/** Speed for a step, and whether it came from the step itself (a pace target). */
function speedFor(sport: string, t: Target | undefined, zones: Zones, pool: Pool): { mps: number; exact: boolean } {
  if (t?.type === "pace_range") return { mps: 1000 / ((t.slowSecPerKm + t.fastSecPerKm) / 2), exact: true };
  if (t?.type === "swim_pace") return { mps: (pool?.unit === "YARD" ? 100 * YARD : 100) / t.secPer100, exact: true };
  if (sport === "run" && zones?.threshold_speed_mps) return { mps: Number(zones.threshold_speed_mps) * 0.82, exact: false };
  return { mps: DEFAULT_SPEED[sport] ?? 2.9, exact: false };
}

function isHard(intensity: string, t: Target | undefined, zones: Zones): boolean {
  if (t?.type === "hr_zone") return t.zone >= 4;
  if (t?.type === "swim_effort") return t.level >= 5 && t.level <= 8;
  if (t?.type === "pace_range" && zones?.threshold_speed_mps) return t.fastSecPerKm <= (1000 / Number(zones.threshold_speed_mps)) * 1.04;
  if (t?.type === "power_range" && zones?.ftp_w) return t.high >= Number(zones.ftp_w) * 0.88;
  return intensity === "INTERVAL";
}

export function workoutTotals(steps: Step[], sport: Sport | string, pool: Pool = null, zones: Zones = null): Totals {
  const out: Totals = { seconds: 0, meters: 0, timeEstimated: false, distanceEstimated: false, openSteps: 0, hardSeconds: 0 };

  // One pass over a list done `times` times. A swim send-off ("leave on 1:45") sets the time for
  // everything since the last send-off, so those steps' own times are replaced by it.
  const walk = (list: Step[], times: number) => {
    let sinceSendoff = 0;
    for (const s of list) {
      if (s.kind === "repeat") {
        walk(s.steps, times * Math.max(1, s.times));
        sinceSendoff = 0;
        continue;
      }
      const d = s.duration;
      let sec = 0;
      if (d.type === "open") {
        out.openSteps += times;
        continue;
      }
      if (d.type === "sendoff") {
        sec = d.seconds - sinceSendoff;
        sinceSendoff = 0;
        if (sec < 0) sec = 0; // can't make that send-off; count the swim time we already have
      } else if (d.type === "time") {
        sec = d.seconds;
        // Rest at the wall covers no distance; otherwise distance from speed.
        if (!(sport === "swim" && s.intensity === "REST")) {
          const sp = speedFor(sport, s.target, zones, pool);
          out.meters += sec * sp.mps * times;
          if (!sp.exact) out.distanceEstimated = true;
        }
        sinceSendoff += sec;
      } else {
        out.meters += d.meters * times;
        const sp = speedFor(sport, s.target, zones, pool);
        sec = d.meters / sp.mps;
        if (!sp.exact) out.timeEstimated = true;
        sinceSendoff += sec;
      }
      out.seconds += sec * times;
      if (isHard(s.intensity, s.target, zones)) out.hardSeconds += sec * times;
    }
  };
  walk(steps ?? [], 1);
  out.seconds = Math.round(out.seconds);
  out.meters = Math.round(out.meters * 10) / 10;
  out.hardSeconds = Math.round(out.hardSeconds);
  return out;
}

// ---------------------------------------------------------------- formatting

/** "45 min", "1 h 05 min". */
export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** Swims in the pool's unit ("2,400 yd"), everything else in mi or km to two places. */
export function formatDistance(meters: number, sport: Sport | string, pool: Pool, units: "mi" | "km"): string {
  if (sport === "swim") {
    const yd = pool?.unit === "YARD";
    const n = Math.round(meters / (yd ? YARD : 1));
    return `${n.toLocaleString("en-US")} ${yd ? "yd" : "m"}`;
  }
  const v = meters / (units === "mi" ? MILE : 1000);
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units}`;
}

export type Summary = { time: string | null; distance: string | null; hard: string | null; structure: string; note: string | null };

/** Everything the summary card shows, as text. */
export function summarize(steps: Step[], sport: Sport | string, pool: Pool, units: "mi" | "km", zones: Zones = null): Summary {
  if (sport === "swim") pool = inferPool(steps, pool);
  const t = workoutTotals(steps, sport, pool, zones);
  // Bike distance from time is a guess at best (wind, hills, trainer); only show it when the steps set it.
  const bikeGuess = sport === "bike" && t.distanceEstimated;
  let meters = t.meters;
  if (sport === "swim" && t.distanceEstimated) meters = Math.round(meters / (pool?.unit === "YARD" ? 25 * YARD : 25)) * (pool?.unit === "YARD" ? 25 * YARD : 25);
  return {
    time: t.seconds > 0 ? `${t.timeEstimated ? "~" : ""}${formatDuration(t.seconds)}` : null,
    distance: meters > 0 && !bikeGuess ? `${t.distanceEstimated ? "~" : ""}${formatDistance(meters, sport, pool, units)}` : null,
    hard: t.hardSeconds >= 60 ? formatDuration(t.hardSeconds) : null,
    structure: structure(steps, sport, pool, units),
    note: t.openSteps ? `Plus ${t.openSteps === 1 ? "1 step" : `${t.openSteps} steps`} until you press lap, not counted.` : null,
  };
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function shortLength(s: Extract<Step, { kind: "step" }>, sport: string, pool: Pool, units: "mi" | "km"): string {
  const d = s.duration;
  if (d.type === "time" || d.type === "sendoff") return d.seconds % 60 === 0 && d.seconds >= 600 ? `${d.seconds / 60} min` : clock(d.seconds);
  if (d.type === "open") return "open";
  if (sport === "swim") return formatDistance(d.meters, sport, pool, units);
  if (d.meters < 1000 || (units === "mi" && d.meters < 1600 && d.meters % 100 === 0)) return `${Math.round(d.meters)} m`;
  return formatDistance(d.meters, sport, pool, units).replace(/\.00 /, " ");
}

const WORK = new Set(["ACTIVE", "INTERVAL", "MAIN"]);

/**
 * The shape of the main set, in a few words: "Warm-up · 5 × 3:00 · Cool-down",
 * "8 × 100 yd", "40 min steady". Warm-up/cool-down named only when present.
 */
export function structure(steps: Step[], sport: Sport | string, pool: Pool, units: "mi" | "km"): string {
  const list = steps ?? [];
  if (!list.length) return "No steps yet";
  const parts: string[] = [];
  for (const s of list) {
    if (s.kind === "repeat") {
      const work = s.steps.filter((c): c is Extract<Step, { kind: "step" }> => c.kind === "step" && WORK.has(c.intensity));
      const inner = (work.length ? work : s.steps.filter((c): c is Extract<Step, { kind: "step" }> => c.kind === "step")).map((c) => shortLength(c, sport, pool, units));
      parts.push(`${s.times} × ${inner.length > 1 ? `(${inner.join(" + ")})` : (inner[0] ?? "set")}`);
    } else if (s.intensity === "WARMUP") parts.push(`Warm-up ${shortLength(s, sport, pool, units)}`);
    else if (s.intensity === "COOLDOWN") parts.push(`Cool-down ${shortLength(s, sport, pool, units)}`);
    else if (WORK.has(s.intensity)) parts.push(shortLength(s, sport, pool, units));
    // Recovery and rest steps between blocks are left out of the headline.
  }
  // Collapse runs of the same thing: "200 yd · 200 yd" → "2 × 200 yd".
  const out: string[] = [];
  for (let i = 0; i < parts.length; ) {
    let j = i;
    while (j + 1 < parts.length && parts[j + 1] === parts[i]) j++;
    out.push(j > i && !/^(Warm|Cool)/.test(parts[i]) ? `${j - i + 1} × ${parts[i]}` : parts[i]);
    i = j + 1;
  }
  return out.join(" · ") || "Easy";
}
