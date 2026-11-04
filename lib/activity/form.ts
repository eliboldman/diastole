// Running form: per-run summaries of running dynamics, judged against general reference ranges and
// the athlete's own baseline, plus fatigue drift (first third vs last third) and patterns across runs.
// Pure module (testable with `node`). Reference bands follow Garmin's published running-dynamics
// color ranges; they're general guidance, not rules — the athlete's own baseline matters more.
import type { Streams } from "./fit.ts";

export type FormMetric = "cadence" | "gct" | "gct_bal" | "vo" | "vr" | "stride" | "power";
export type MetricSummary = { avg: number; first: number; last: number; n: number };
/** `pace`: average speed (m/s) in the first and last third, so drift is only judged at similar pace. */
export type FormSummary = { v: 1; moving_s: number; metrics: Partial<Record<FormMetric, MetricSummary>>; pace?: { first: number; last: number } };
export type Status = "green" | "yellow" | "red";

type Better = "higher" | "lower" | "balanced";
type Meta = {
  label: string;
  unit: string;
  better: Better;
  format: (v: number) => string;
  /** General reference band, or null where it depends on the person (stride, power). */
  ref: ((v: number) => Status) | null;
  refText: string | null;
  /** "Worse" change vs the athlete's baseline: [yellow, red] as a fraction, or absolute points for balance. */
  baseline: [number, number] | null;
  /** A worse change from the first to the last third that counts as fatigue drift; null = not judged. */
  drift: number | null;
  /** What a device needs to record it, shown when it's missing. */
  gear: string;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
// Wording is neutral ("usual", not "your"/"their") because coach, athlete and pod mates all read it.
const balDev = (v: number) => Math.abs(v - 50);

export const FORM: Record<FormMetric, Meta> = {
  cadence: {
    label: "Cadence",
    unit: "spm",
    better: "higher",
    format: (v) => String(Math.round(v)),
    ref: (v) => (v >= 165 ? "green" : v >= 155 ? "yellow" : "red"),
    refText: "165+ spm",
    baseline: [0.03, 0.06],
    drift: 0.03,
    gear: "Recorded by most GPS watches.",
  },
  gct: {
    label: "Ground contact time",
    unit: "ms",
    better: "lower",
    format: (v) => String(Math.round(v)),
    ref: (v) => (v <= 277 ? "green" : v <= 308 ? "yellow" : "red"),
    refText: "under 278 ms",
    baseline: [0.04, 0.08],
    drift: 0.04,
    gear: "Needs a watch with running dynamics, a Garmin HRM-Pro / HRM 600 chest strap or Running Dynamics Pod, or an Apple Watch.",
  },
  gct_bal: {
    label: "Ground contact balance",
    unit: "% left",
    better: "balanced",
    format: (v) => v.toFixed(1),
    ref: (v) => (balDev(v) <= 0.7 ? "green" : balDev(v) <= 1.5 ? "yellow" : "red"),
    refText: "within 0.7% of 50/50",
    baseline: [0.5, 1.0],
    drift: 0.5,
    gear: "Needs a Garmin HRM-Pro / HRM 600 chest strap or Running Dynamics Pod.",
  },
  vo: {
    label: "Vertical oscillation",
    unit: "cm",
    better: "lower",
    format: (v) => (v / 10).toFixed(1),
    ref: (v) => (v <= 109 ? "green" : v <= 130 ? "yellow" : "red"),
    refText: "under 11 cm",
    baseline: [0.05, 0.1],
    drift: 0.05,
    gear: "Needs a watch with running dynamics, a Garmin HRM-Pro / HRM 600 or Running Dynamics Pod, or an Apple Watch.",
  },
  vr: {
    label: "Vertical ratio",
    unit: "%",
    better: "lower",
    format: (v) => v.toFixed(1),
    ref: (v) => (v <= 8.6 ? "green" : v <= 10.1 ? "yellow" : "red"),
    refText: "under 8.7%",
    baseline: [0.05, 0.1],
    drift: 0.05,
    gear: "Needs a watch with running dynamics or a Garmin HRM-Pro / HRM 600 or Running Dynamics Pod.",
  },
  stride: {
    label: "Stride length",
    unit: "m",
    better: "higher",
    format: (v) => v.toFixed(2),
    ref: null,
    refText: null,
    baseline: [0.04, 0.08],
    drift: 0.04,
    gear: "Needs a watch with running dynamics, a Garmin HRM-Pro / HRM 600 or Running Dynamics Pod, or an Apple Watch.",
  },
  power: {
    label: "Running power",
    unit: "W",
    better: "higher",
    format: (v) => String(Math.round(v)),
    ref: null,
    refText: null,
    baseline: null, // depends on pace and terrain, so no baseline judgement
    drift: null, // late-run power mostly follows pace, not form
    gear: "Needs a watch with running power (most recent Garmin and Apple watches) or a power pod.",
  },
};

export const FORM_ORDER: FormMetric[] = ["cadence", "gct", "gct_bal", "vo", "vr", "stride", "power"];
export const RUN_SPORT = /run|treadmill|trail|track/i;
const MOVING_MPS = 1.6; // slower than ~10:25 /km counts as walking or standing
const SAME_PACE = 0.06; // drift is only judged when the first and last thirds were within 6% of each other

/** Per-run form summary from resampled streams. Null for non-runs or when no form data was recorded. */
export function summarizeForm(streams: Streams | null | undefined, sport: string | null): FormSummary | null {
  if (!streams || !RUN_SPORT.test(sport ?? "")) return null;
  const n = streams.t.length;
  const moving = streams.speed ? streams.speed.map((s) => s !== null && s >= MOVING_MPS) : new Array(n).fill(true);
  const idx = moving.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 6) return null;
  const third = Math.floor(idx.length / 3);
  const mean = (vals: (number | null)[], from: number, to: number) => {
    let sum = 0;
    let count = 0;
    for (let k = from; k < to; k++) {
      const v = vals[idx[k]];
      if (v !== null && v !== undefined && v > 0) {
        sum += v;
        count++;
      }
    }
    return count ? { mean: sum / count, count } : null;
  };

  const metrics: FormSummary["metrics"] = {};
  for (const m of FORM_ORDER) {
    const vals = streams[m];
    if (!vals) continue;
    const all = mean(vals, 0, idx.length);
    const first = mean(vals, 0, third);
    const last = mean(vals, idx.length - third, idx.length);
    if (!all || !first || !last || all.count < 6) continue;
    const r = (v: number) => Number(v.toFixed(m === "stride" ? 3 : 2));
    metrics[m] = { avg: r(all.mean), first: r(first.mean), last: r(last.mean), n: all.count };
  }
  if (!Object.keys(metrics).length) return null;
  const speedFirst = streams.speed ? mean(streams.speed, 0, third) : null;
  const speedLast = streams.speed ? mean(streams.speed, idx.length - third, idx.length) : null;
  const pace = speedFirst && speedLast ? { first: Number(speedFirst.mean.toFixed(3)), last: Number(speedLast.mean.toFixed(3)) } : undefined;
  return { v: 1, moving_s: idx.length * streams.interval_s, metrics, ...(pace ? { pace } : {}) };
}

/** How much worse b is than a for this metric (fraction, or points for balance). Positive = worse. */
export function worseBy(m: FormMetric, from: number, to: number): number {
  const meta = FORM[m];
  if (meta.better === "balanced") return balDev(to) - balDev(from);
  const change = (to - from) / from;
  return meta.better === "lower" ? change : -change;
}

const rank: Record<Status, number> = { green: 0, yellow: 1, red: 2 };
const worst = (a: Status | null, b: Status | null): Status | null => (!a ? b : !b ? a : rank[a] >= rank[b] ? a : b);

export type Judgement = { status: Status | null; reference: Status | null; vsBaseline: Status | null; baseline: number | null; line: string };

/** Median of the athlete's previous runs (needs 5+). */
export function baselineOf(previous: (number | undefined)[]): number | null {
  const v = previous.filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  if (v.length < 5) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function judge(m: FormMetric, value: number, baseline: number | null): Judgement {
  const meta = FORM[m];
  const reference = meta.ref ? meta.ref(value) : null;
  let vsBaseline: Status | null = null;
  let delta = 0;
  if (baseline !== null && meta.baseline) {
    delta = worseBy(m, baseline, value);
    vsBaseline = delta >= meta.baseline[1] ? "red" : delta >= meta.baseline[0] ? "yellow" : "green";
  }
  const parts: string[] = [];
  if (reference && reference !== "green") {
    const dir = meta.better === "balanced" ? `${balDev(value).toFixed(1)}% off even` : meta.better === "lower" ? "higher than" : "lower than";
    parts.push(
      meta.better === "balanced"
        ? `${dir} (common range: ${meta.refText}).`
        : `A bit ${dir} the common range (${meta.refText}); easy and hilly runs often sit here.`,
    );
  }
  if (vsBaseline && vsBaseline !== "green") {
    const size = meta.better === "balanced" ? `${delta.toFixed(1)} points further from even` : `${pct(Math.abs((value - baseline!) / baseline!))} ${value > baseline! ? "higher" : "lower"}`;
    parts.push(`${size} than usual (${meta.format(baseline!)} ${meta.unit}).`);
  }
  if (!parts.length && !meta.ref && !meta.baseline) {
    parts.push(baseline !== null ? `Usually ${meta.format(baseline)} ${meta.unit}; it follows pace and hills, so it isn't judged.` : "Follows pace and hills, so it isn't judged.");
  }
  if (!parts.length) {
    parts.push(
      baseline !== null
        ? `In line with usual (${meta.format(baseline)} ${meta.unit}).`
        : reference
          ? `In the common range (${meta.refText}).`
          : "A baseline builds after 5 runs with this metric.",
    );
  }
  return { status: worst(reference, vsBaseline), reference, vsBaseline, baseline, line: parts.join(" ") };
}

/**
 * First third vs last third. `drifted` when it got worse by more than the metric's threshold and the
 * two thirds were run at a similar pace (otherwise the change is about pace, not fatigue).
 */
export function drift(m: FormMetric, s: MetricSummary, pace?: { first: number; last: number }) {
  const worse = worseBy(m, s.first, s.last);
  const meta = FORM[m];
  const paceChanged = pace ? Math.abs(pace.last / pace.first - 1) > SAME_PACE : false;
  const change = meta.better === "balanced" ? s.last - s.first : (s.last - s.first) / s.first;
  const text =
    meta.better === "balanced"
      ? `${meta.format(s.first)} → ${meta.format(s.last)} ${meta.unit}`
      : `${change >= 0 ? "+" : "−"}${pct(Math.abs(change))} (${meta.format(s.first)} → ${meta.format(s.last)} ${meta.unit})`;
  return { worse, drifted: meta.drift !== null && !paceChanged && worse >= meta.drift, paceChanged, text };
}

// ---------------------------------------------------------------- patterns across runs

export type FormRun = { date: string; form: FormSummary };
export type Pattern = { key: string; metric: FormMetric; kind: "level" | "fatigue"; runs: number; of: number; detail: string };

/**
 * Issues that show up consistently: a metric flagged yellow/red (vs reference or baseline) in 3+ of
 * the last 5 runs, or drifting worse late in 3+ of the last 5. Runs must be newest first.
 */
export function detectPatterns(runs: FormRun[], window = 5, needed = 3): Pattern[] {
  const recent = runs.slice(0, window);
  if (recent.length < needed) return [];
  const out: Pattern[] = [];
  for (const m of FORM_ORDER) {
    const flagged: string[] = [];
    const drifted: string[] = [];
    let seen = 0;
    recent.forEach((r, i) => {
      const s = r.form.metrics[m];
      if (!s) return;
      seen++;
      const base = baselineOf(runs.slice(i + 1, i + 21).map((x) => x.form.metrics[m]?.avg));
      const j = judge(m, s.avg, base);
      if (j.status === "yellow" || j.status === "red") flagged.push(`${r.date}: ${FORM[m].format(s.avg)} ${FORM[m].unit}`);
      const d = drift(m, s, r.form.pace);
      if (d.drifted) drifted.push(`${r.date}: ${d.text}`);
    });
    if (seen < needed) continue;
    if (flagged.length >= needed && FORM[m].ref !== null)
      out.push({ key: `${m}:level`, metric: m, kind: "level", runs: flagged.length, of: seen, detail: flagged.join("; ") });
    if (drifted.length >= needed) out.push({ key: `${m}:fatigue`, metric: m, kind: "fatigue", runs: drifted.length, of: seen, detail: drifted.join("; ") });
  }
  return out;
}
