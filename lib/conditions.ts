// Heat and altitude: how much slower (or lower-powered) the same effort is, and the workout's
// targets adjusted to match. Opt-in per athlete. Rules of thumb, not lab science. Pure, for tests.
import type { Step } from "./workouts/garmin-format.ts";

/** About 0.5% slower per °C of "feels like" above 15 °C, up to 8%. */
export const heatSlowdown = (feelsC: number | null | undefined) => (feelsC == null || feelsC <= 15 ? 0 : Math.min(0.08, (feelsC - 15) * 0.005));
/** About 1% slower per 300 m above 900 m, up to 8%. */
export const altitudeSlowdown = (m: number | null | undefined) => (m == null || m <= 900 ? 0 : Math.min(0.08, ((m - 900) / 300) * 0.01));

export type Conditions = { heat: number; altitude: number; total: number; feelsC: number | null; elevation: number | null };
export function conditionsFor(feelsC: number | null | undefined, elevation: number | null | undefined): Conditions {
  const heat = heatSlowdown(feelsC);
  const altitude = altitudeSlowdown(elevation);
  return { heat, altitude, total: Math.min(0.12, heat + altitude), feelsC: feelsC ?? null, elevation: elevation ?? null };
}

/** Pace targets slower and power targets lower by the slowdown; heart-rate targets stay (they already track effort). */
export function adjustForConditions(steps: Step[], f: number): Step[] {
  if (f <= 0) return steps;
  return steps.map((s): Step => {
    if (s.kind === "repeat") return { ...s, steps: adjustForConditions(s.steps, f) };
    const t = s.target;
    if (t?.type === "pace_range") return { ...s, target: { type: "pace_range", fastSecPerKm: Math.round(t.fastSecPerKm * (1 + f)), slowSecPerKm: Math.round(t.slowSecPerKm * (1 + f)) } };
    if (t?.type === "power_range") return { ...s, target: { type: "power_range", low: Math.round(t.low * (1 - f * 0.6)), high: Math.round(t.high * (1 - f * 0.6)) } };
    return s;
  });
}

/** "Paces about 5% slower for heat (feels like 84°F) and altitude (5,200 ft)." */
export function conditionsNote(c: Conditions, units: "mi" | "km", sport: string) {
  const why = [
    c.heat > 0 && c.feelsC != null ? `heat (feels like ${units === "mi" ? `${Math.round((c.feelsC * 9) / 5 + 32)}°F` : `${Math.round(c.feelsC)}°C`})` : null,
    c.altitude > 0 && c.elevation != null ? `altitude (${units === "mi" ? `${Math.round(c.elevation * 3.281).toLocaleString("en-US")} ft` : `${Math.round(c.elevation).toLocaleString("en-US")} m`})` : null,
  ].filter(Boolean);
  const what = /bik|cycl|ride/.test(sport) ? `Power about ${Math.round(c.total * 60)}% lower` : `Paces about ${Math.round(c.total * 100)}% slower`;
  return `${what} for ${why.join(" and ")}. Heart-rate targets stay the same: they already follow your effort.`;
}
