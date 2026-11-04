// Display formatting for activities. Every helper returns null for missing data, so callers can
// hide the field instead of printing a zero.

export const FOOT_SPORT = /run|walk|hik|trail|treadmill|track/i;
export const isFootSport = (sport: string | null | undefined) => FOOT_SPORT.test(sport ?? "");

const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

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

export function km(meters: number | null | undefined, digits = 2) {
  if (!has(meters) || meters < 10) return null;
  return `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : digits)} km`;
}

/** Minutes per km from m/s; null when standing still. */
export function paceOf(mps: number | null | undefined) {
  if (!has(mps) || mps < 0.5) return null;
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

export function kmh(mps: number | null | undefined) {
  if (!has(mps)) return null;
  return `${(mps * 3.6).toFixed(1)} km/h`;
}

/** Pace for foot sports, speed for everything else. */
export function speedText(mps: number | null | undefined, sport: string | null | undefined) {
  if (isFootSport(sport)) {
    const p = paceOf(mps);
    return p ? `${p} /km` : null;
  }
  return kmh(mps);
}

export function whole(v: number | null | undefined, unit: string) {
  return has(v) ? `${Math.round(v).toLocaleString("en-US")} ${unit}` : null;
}
