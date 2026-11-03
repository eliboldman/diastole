// Plain-language lines for a workout's steps (used in send confirmations, adjust previews and version history).
import type { Duration, Step, Target } from "./garmin-format";

const MI = 1609.344;
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export function describe(steps: Step[], paceUnit: "mi" | "km" = "mi"): string[] {
  const dur = (d: Duration) =>
    d.type === "time"
      ? clock(d.seconds)
      : d.type === "distance"
        ? d.meters >= 1000
          ? `${+(d.meters / 1000).toFixed(2)} km`
          : `${d.meters} m`
        : "until lap";
  const tgt = (t?: Target) => {
    if (!t) return "";
    if (t.type === "hr_zone") return ` @ HR zone ${t.zone}`;
    if (t.type === "hr_range") return ` @ ${t.low}–${t.high} bpm`;
    if (t.type === "power_range") return ` @ ${t.low}–${t.high} W`;
    const f = paceUnit === "mi" ? MI / 1000 : 1;
    return ` @ ${clock(t.slowSecPerKm * f)}–${clock(t.fastSecPerKm * f)}/${paceUnit}`;
  };
  const one = (s: Step) => (s.kind === "step" ? `${s.intensity.toLowerCase()} ${dur(s.duration)}${tgt(s.target)}` : "");
  return steps.flatMap((s) => (s.kind === "repeat" ? [`${s.times} × [ ${s.steps.map(one).join(", ")} ]`] : [one(s)]));
}
