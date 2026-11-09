// Diastole workout steps → intervals.icu workout text (their "workout builder" syntax), which
// intervals.icu turns into a structured workout and forwards to Zwift and Rouvy.
// Pure module (only pure imports) so it can be tested directly with `node`.
//
// Syntax notes (intervals.icu quick guide, 2026): one "- " line per step: cue, duration or
// distance, target. Repeats are an "Nx" line with a blank line before and after; no nesting.
// "m" means minutes ("mtr" = meters). Absolute bpm isn't supported, so HR ranges become % of max
// HR when we know it. There's no lap-button step in text, so open steps become 5 min free ride.
// Zwift and Rouvy can only drive the trainer from power: an HR-only step shows up there as a flat,
// empty ride. So when we know FTP, HR targets go as the matching power zone (% of FTP) instead.

import { hrTargetPowerPct } from "../workouts/bike-power.ts";
import type { Duration, Step, Target } from "../workouts/garmin-format.ts";

export type IntervalsOptions = {
  ftp?: number | null; // watts; when set, power goes as % of FTP so Zwift/Rouvy scale it to the rider
  maxHr?: number | null;
};

const OPEN_STEP_SECONDS = 300;

export function duration(sec: number): string {
  const s = Math.max(1, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h ? `${h}h` : ""}${m ? `${m}m` : ""}${r ? `${r}s` : ""}`;
}

function length(d: Duration): { text: string; open: boolean } {
  if ((d.type === "time" || d.type === "sendoff") && d.seconds > 0) return { text: duration(d.seconds), open: false };
  if (d.type === "distance" && d.meters > 0) {
    return { text: d.meters >= 1000 ? `${+(d.meters / 1000).toFixed(2)}km` : `${Math.round(d.meters)}mtr`, open: false };
  }
  return { text: duration(OPEN_STEP_SECONDS), open: true };
}

const range = (lo: number, hi: number, unit: string) => (lo === hi ? `${lo}${unit}` : `${lo}-${hi}${unit}`);


function target(t: Target | undefined, o: IntervalsOptions): string | null {
  if (!t) return null;
  switch (t.type) {
    case "power_range": {
      if (!(t.low > 0 && t.high >= t.low)) return null;
      if (o.ftp && o.ftp > 0) return range(Math.round((t.low / o.ftp) * 100), Math.round((t.high / o.ftp) * 100), "%");
      return range(Math.round(t.low), Math.round(t.high), "w");
    }
    case "hr_zone":
    case "hr_range": {
      const pct = o.ftp && o.ftp > 0 ? hrTargetPowerPct(t, o.maxHr) : null;
      if (pct) return range(pct[0], pct[1], "%");
      if (t.type === "hr_zone") return `Z${t.zone} HR`;
      if (!(o.maxHr && o.maxHr > 0 && t.low > 0 && t.high >= t.low)) return null;
      return `${range(Math.round((t.low / o.maxHr) * 100), Math.round((t.high / o.maxHr) * 100), "%")} HR`;
    }
    default:
      return null; // pace/swim targets don't apply on the bike
  }
}

/** Cue text goes before the duration; digits, quotes and markers could be read as a duration or prompt. */
export function cue(note: string | undefined): string {
  return (note ?? "")
    .replace(/[0-9%'"^<>!#*_`|\\+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}

type Flat = Extract<Step, { kind: "step" }>;
const flatten = (steps: Step[]): Flat[] => steps.flatMap((s) => (s.kind === "step" ? [s] : Array.from({ length: Math.min(99, Math.max(1, s.times)) }, () => flatten(s.steps)).flat()));

function line(s: Flat, o: IntervalsOptions): string {
  const len = length(s.duration);
  const tgt = target(s.target, o);
  const label = cue(s.note) || (len.open ? "Open step" : "");
  return ["-", label, len.text, tgt ?? "freeride"].filter(Boolean).join(" ");
}

/** The workout as intervals.icu text. Empty string when there are no steps. */
export function toIntervalsText(steps: Step[], o: IntervalsOptions = {}): string {
  const blocks: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) blocks.push(run.join("\n"));
    run = [];
  };
  for (const s of steps ?? []) {
    if (s.kind === "step") {
      run.push(line(s, o));
    } else {
      flush();
      // Nested repeats aren't supported in the text format: expand anything inside the block.
      const inner = s.steps.flatMap((x) => (x.kind === "step" ? [x] : flatten([x])));
      if (inner.length) blocks.push([`${Math.min(99, Math.max(1, s.times))}x`, ...inner.map((x) => line(x, o))].join("\n"));
    }
  }
  flush();
  return blocks.join("\n\n");
}

/** Planned seconds (timed and open steps; distance steps aren't counted). */
export function plannedSeconds(steps: Step[]): number {
  return flatten(steps ?? []).reduce((n, s) => n + (s.duration.type === "time" || s.duration.type === "sendoff" ? s.duration.seconds : s.duration.type === "open" ? OPEN_STEP_SECONDS : 0), 0);
}
