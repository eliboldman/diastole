// Display formatting for activities. Every helper returns null for missing data, so callers can
// hide the field instead of printing a zero. Distances and paces follow the viewer's units.

import type { PoolUnit } from "../workouts/garmin-format.ts";
import { isSwim, swimDist, swimPace, swimPool } from "./swim.ts";

export type Units = "mi" | "km";
export const MILE = 1609.344;

export const FOOT_SPORT = /run|walk|hik|trail|treadmill|track/i;
export const isFootSport = (sport: string | null | undefined) => FOOT_SPORT.test(sport ?? "");

const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const per = (u: Units) => (u === "mi" ? MILE : 1000);

export function sportLabel(sport: string | null | undefined) {
  if (!sport) return "Activity";
  const s = sport.replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 1:02:05 or 42:10 */
export function clock(seconds: number | null | undefined) {
  if (!has(seconds)) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "3.11 mi" / "5.00 km". Under 10 m is treated as no distance. */
export function distance(meters: number | null | undefined, u: Units, digits = 2) {
  if (!has(meters) || meters < 10) return null;
  const v = meters / per(u);
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${u}`;
}

/** Shorter form for lists: "3.1 mi", or "1,425 yd" for swims. Hidden under 100 m. */
export function shortDistance(meters: number | null | undefined, u: Units, sport?: string | null) {
  if (!has(meters) || meters < 100) return null;
  if (isSwim(sport)) return swimDist(meters, swimUnitFor(meters, u));
  return distance(meters, u, 1);
}

/** Yards or meters for a swim with no lap detail: whole 25 yd lengths say yards, else the viewer's units. */
function swimUnitFor(meters: number, u: Units) {
  return swimPool(null, [], meters, u).unit;
}

/** @deprecated use distance(meters, units) */
export const km = (meters: number | null | undefined, digits = 2) => distance(meters, "km", digits);

/** Minutes per mile or km from m/s; null when standing still. */
export function paceOf(mps: number | null | undefined, u: Units = "km") {
  if (!has(mps) || mps < 0.5) return null;
  const secPer = per(u) / mps;
  const m = Math.floor(secPer / 60);
  const s = Math.round(secPer % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function speedOf(mps: number | null | undefined, u: Units) {
  if (!has(mps)) return null;
  return u === "mi" ? `${(mps * 2.236936).toFixed(1)} mph` : `${(mps * 3.6).toFixed(1)} km/h`;
}

/** Pace for foot sports, pace per 100 for swims, speed for everything else. */
export function speedText(mps: number | null | undefined, sport: string | null | undefined, u: Units = "km", swimUnit?: PoolUnit) {
  if (isSwim(sport)) return swimPace(mps, swimUnit ?? (u === "mi" ? "YARD" : "METER"));
  if (isFootSport(sport)) {
    const p = paceOf(mps, u);
    return p ? `${p} /${u}` : null;
  }
  return speedOf(mps, u);
}

export function whole(v: number | null | undefined, unit: string) {
  return has(v) ? `${Math.round(v).toLocaleString("en-US")} ${unit}`.trim() : null;
}
