// Plain-language lines for a workout's steps (used in send confirmations, adjust previews and version history).
import { DRILLS, EQUIPMENT, STROKES, SWIM_EFFORTS, YARD, type Duration, type Pool, type Step, type Target } from "./garmin-format.ts";

const MI = 1609.344;
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** "100 yd" / "400 m": swim distances in the pool's own unit. */
export function swimDistance(meters: number, pool: Pool) {
  if (pool?.unit === "YARD") return `${Math.round(meters / YARD)} yd`;
  return `${Math.round(meters)} m`;
}

export function describe(steps: Step[], paceUnit: "mi" | "km" = "mi", pool: Pool = null, swim = false): string[] {
  const dur = (d: Duration) =>
    d.type === "time"
      ? clock(d.seconds)
      : d.type === "sendoff"
        ? `send-off ${clock(d.seconds)}`
        : d.type === "distance"
          ? swim
            ? swimDistance(d.meters, pool)
            : d.meters >= 1000
              ? `${+(d.meters / 1000).toFixed(2)} km`
              : `${d.meters} m`
          : "until lap";
  const tgt = (t?: Target) => {
    if (!t) return "";
    switch (t.type) {
      case "hr_zone":
        return ` @ HR zone ${t.zone}`;
      case "hr_range":
        return ` @ ${t.low}–${t.high} bpm`;
      case "power_range":
        return ` @ ${t.low}–${t.high} W`;
      case "pace_range": {
        const f = paceUnit === "mi" ? MI / 1000 : 1;
        return ` @ ${clock(t.slowSecPerKm * f)}–${clock(t.fastSecPerKm * f)}/${paceUnit}`;
      }
      case "swim_effort":
        return ` · ${SWIM_EFFORTS[t.level].toLowerCase()}`;
      case "swim_pace":
        return ` @ ${clock(t.secPer100)}/100${pool?.unit === "YARD" ? "yd" : "m"}`;
    }
  };
  const one = (s: Step) => {
    if (s.kind !== "step") return "";
    if (swim && s.intensity === "REST") return s.duration.type === "time" ? `rest ${clock(s.duration.seconds)}` : `rest, ${dur(s.duration)}`;
    const swimBits = swim
      ? [s.stroke ? STROKES[s.stroke].toLowerCase() : null, s.drill ? DRILLS[s.drill].toLowerCase() : null, s.equipment ? `with ${EQUIPMENT[s.equipment].toLowerCase()}` : null]
          .filter(Boolean)
          .join(" ")
      : "";
    return `${s.intensity.toLowerCase()} ${dur(s.duration)}${swimBits ? ` ${swimBits}` : ""}${tgt(s.target)}`;
  };
  return steps.flatMap((s) => (s.kind === "repeat" ? [`${s.times} × [ ${s.steps.map(one).join(", ")} ]`] : [one(s)]));
}
