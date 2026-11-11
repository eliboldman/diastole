// Race time estimates from what the athlete has shown: best efforts (Riegel), threshold pace, FTP
// (flat-course power-to-speed) and CSS, with triathlon splits. Rules, not AI. An estimate with a
// range, never a promise. Pure module, testable with `node`.

export type RunKey = "run_1mi" | "run_5k" | "run_10k" | "run_half";
export type RunEffort = { date: string; key: RunKey; seconds: number };
export type PredictInput = {
  today: string;
  efforts: RunEffort[]; // best efforts inside workouts, any age (filtered here)
  thresholdSpeed: number | null; // m/s, running threshold (≈ one-hour race pace)
  ftp: number | null; // W
  css: number | null; // s per 100 m
  weightKg: number | null;
};

export type Range = { mid: number; low: number; high: number };
export type Driver = { text: string; kind: "data" | "missing" };
export type Split = { leg: "swim" | "t1" | "bike" | "t2" | "run"; range: Range };
export type Prediction = { key: string; label: string; range: Range; splits?: Split[]; confidence: "good" | "rough"; drivers: Driver[] };

export const EFFORT_M: Record<RunKey, number> = { run_1mi: 1609.344, run_5k: 5000, run_10k: 10000, run_half: 21097.5 };
const EFFORT_LABEL: Record<RunKey, string> = { run_1mi: "Mile", run_5k: "5K", run_10k: "10K", run_half: "Half" };

export type Tri = { key: string; label: string; swim: number; bike: number; run: number; bikeIF: number; swimEase: number; runFade: number; t1: number; t2: number };
export const TRIS: Tri[] = [
  { key: "tri_sprint", label: "Sprint tri", swim: 750, bike: 20000, run: 5000, bikeIF: 0.92, swimEase: 1.02, runFade: 1.04, t1: 120, t2: 90 },
  { key: "tri_olympic", label: "Olympic tri", swim: 1500, bike: 40000, run: 10000, bikeIF: 0.88, swimEase: 1.03, runFade: 1.06, t1: 180, t2: 120 },
  { key: "tri_70_3", label: "70.3", swim: 1900, bike: 90000, run: 21097.5, bikeIF: 0.8, swimEase: 1.05, runFade: 1.1, t1: 240, t2: 180 },
  { key: "tri_ironman", label: "Ironman", swim: 3800, bike: 180200, run: 42195, bikeIF: 0.7, swimEase: 1.08, runFade: 1.2, t1: 360, t2: 240 },
];
export const RUNS = [
  { key: "run_5k", label: "5K", meters: 5000 },
  { key: "run_10k", label: "10K", meters: 10000 },
  { key: "run_half", label: "Half marathon", meters: 21097.5 },
  { key: "run_marathon", label: "Marathon", meters: 42195 },
] as const;

const DAY = 86_400_000;
const WINDOW_DAYS = 120;
const ageDays = (d: string, today: string) => Math.max(0, (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / DAY);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const riegel = (t: number, d: number, D: number, k = 1.06) => t * Math.pow(D / d, k);
export const fmt = (s: number) => {
  const r = Math.round(s);
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  const sec = r % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const range = (mid: number, spread: number): Range => ({ mid: Math.round(mid), low: Math.round(mid * (1 - spread)), high: Math.round(mid * (1 + spread * 1.5)) });
const scale = (r: Range, f: number): Range => ({ mid: Math.round(r.mid * f), low: Math.round(r.low * f), high: Math.round(r.high * f) });
const add = (...rs: Range[]): Range => rs.reduce((a, r) => ({ mid: a.mid + r.mid, low: a.low + r.low, high: a.high + r.high }), { mid: 0, low: 0, high: 0 });

/** Fastest effort per distance in the window. */
function bestEfforts(efforts: RunEffort[], today: string) {
  const best = new Map<RunKey, RunEffort>();
  for (const e of efforts) {
    if (!(e.seconds > 0) || !EFFORT_M[e.key] || e.date > today || ageDays(e.date, today) > WINDOW_DAYS) continue;
    const cur = best.get(e.key);
    if (!cur || e.seconds < cur.seconds) best.set(e.key, e);
  }
  return [...best.values()];
}

/** Open run time for a distance: weighted blend of each best effort (Riegel) and threshold pace. */
export function predictRun(meters: number, inp: Pick<PredictInput, "today" | "efforts" | "thresholdSpeed">): { range: Range; confidence: "good" | "rough"; drivers: Driver[] } | null {
  const sources: { t: number; w: number }[] = [];
  const drivers: Driver[] = [];
  const efforts = bestEfforts(inp.efforts, inp.today);
  for (const e of efforts) {
    const d = EFFORT_M[e.key];
    const age = ageDays(e.date, inp.today);
    const w = Math.exp(-age / 60) / (1 + Math.abs(Math.log(meters / d)));
    sources.push({ t: riegel(e.seconds, d, meters), w });
    drivers.push({ text: `${EFFORT_LABEL[e.key]} best ${fmt(e.seconds)} (${shortDate(e.date)})`, kind: "data" });
  }
  if (inp.thresholdSpeed && inp.thresholdSpeed > 1) {
    const hourD = inp.thresholdSpeed * 3600;
    sources.push({ t: riegel(3600, hourD, meters), w: 0.6 / (1 + Math.abs(Math.log(meters / hourD))) });
    drivers.push({ text: "Threshold pace", kind: "data" });
  }
  if (!sources.length) return null;
  const wsum = sources.reduce((a, s) => a + s.w, 0);
  const mid = sources.reduce((a, s) => a + s.t * s.w, 0) / wsum;
  const ts = sources.map((s) => s.t);
  const disagree = (Math.max(...ts) - Math.min(...ts)) / 2 / mid;
  const longest = Math.max(0, ...efforts.map((e) => EFFORT_M[e.key]));
  const recent = efforts.some((e) => ageDays(e.date, inp.today) <= 45);
  let spread = Math.max(0.02, disagree);
  if (sources.length < 2) spread += 0.01;
  if (meters > Math.max(longest, inp.thresholdSpeed ? inp.thresholdSpeed * 3600 : 0) * 1.5) spread += 0.02; // well past anything shown
  if (!recent) spread += 0.01;
  if (!efforts.length) drivers.push({ text: "No fast run efforts in the last 4 months", kind: "missing" });
  return { range: range(mid, clamp(spread, 0.02, 0.09)), confidence: sources.length >= 2 && recent ? "good" : "rough", drivers };
}

/** Flat-road speed for a power, rider + bike mass, CdA 0.30 (a reasonably aero position). */
export function speedFor(watts: number, massKg: number): number {
  const p = watts * 0.975;
  let lo = 0;
  let hi = 25;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    const need = 0.5 * 1.2 * 0.3 * v ** 3 + 0.004 * massKg * 9.81 * v;
    if (need > p) hi = v;
    else lo = v;
  }
  return (lo + hi) / 2;
}

/** Bike time on a flat course at a fraction of FTP (or a standalone time-trial effort for the distance). */
export function predictBike(meters: number, ftp: number | null, weightKg: number | null, intensity?: number): Range | null {
  if (!ftp) return null;
  const mass = (weightKg ?? 70) + 10;
  let f = intensity ?? 1;
  let t = meters / speedFor(ftp * f, mass);
  if (intensity === undefined) {
    // A solo effort: about FTP for an hour, less the longer it goes.
    for (let i = 0; i < 4; i++) {
      f = clamp(1 - 0.07 * Math.log2(t / 3600), 0.7, 1.05);
      t = meters / speedFor(ftp * f, mass);
    }
  }
  return range(t, weightKg ? 0.04 : 0.06);
}

/** Swim time from CSS (pace a bit slower the longer it goes). */
export function predictSwim(meters: number, css: number | null, ease = 1): Range | null {
  if (!css) return null;
  const pace = css * Math.pow(meters / 1500, 0.05) * ease;
  return range((meters / 100) * pace, 0.04);
}

const FLAT_NOTE: Driver = { text: "Flat course, good conditions", kind: "data" };

export function predictTri(tri: Tri, inp: PredictInput): Prediction | null {
  const swim = predictSwim(tri.swim, inp.css, tri.swimEase);
  const bike = predictBike(tri.bike, inp.ftp, inp.weightKg, tri.bikeIF);
  const run = predictRun(tri.run, inp);
  const drivers: Driver[] = [];
  if (!swim) drivers.push({ text: "Add CSS to estimate the swim", kind: "missing" });
  if (!bike) drivers.push({ text: "Add FTP to estimate the bike", kind: "missing" });
  if (!run) drivers.push({ text: "A recent hard run or threshold pace estimates the run", kind: "missing" });
  if (!swim || !bike || !run) return { key: tri.key, label: tri.label, range: { mid: 0, low: 0, high: 0 }, confidence: "rough", drivers };
  const t1 = range(tri.t1, 0.2);
  const t2 = range(tri.t2, 0.2);
  const runOff = scale(run.range, tri.runFade);
  const splits: Split[] = [
    { leg: "swim", range: swim },
    { leg: "t1", range: t1 },
    { leg: "bike", range: bike },
    { leg: "t2", range: t2 },
    { leg: "run", range: runOff },
  ];
  drivers.push({ text: `CSS ${fmt(inp.css!)}/100 m`, kind: "data" }, { text: `FTP ${inp.ftp} W at ${Math.round(tri.bikeIF * 100)}%`, kind: "data" }, ...run.drivers, FLAT_NOTE);
  return { key: tri.key, label: tri.label, range: add(...splits.map((s) => s.range)), splits, confidence: run.confidence, drivers };
}

/** Standard distances: road runs and the four triathlons. Missing pieces come back as drivers to fill in. */
export function predictAll(inp: PredictInput): Prediction[] {
  const out: Prediction[] = [];
  for (const r of RUNS) {
    const p = predictRun(r.meters, inp);
    if (p) out.push({ key: r.key, label: r.label, ...p });
  }
  for (const t of TRIS) {
    const p = predictTri(t, inp);
    if (p) out.push(p);
  }
  return out;
}

/** The nearest standard triathlon for a race's total distance. */
export function triFor(totalKm: number | null): Tri {
  const target = totalKm ?? 51.5;
  return TRIS.reduce((best, t) => (Math.abs((t.swim + t.bike + t.run) / 1000 - target) < Math.abs((best.swim + best.bike + best.run) / 1000 - target) ? t : best), TRIS[1]);
}

/** One race: sport + distance. Null when there isn't enough to go on. */
export function predictRace(race: { sport: string; distance_km: number | null }, inp: PredictInput): Prediction | null {
  const m = (race.distance_km ?? 0) * 1000;
  if (race.sport === "tri") {
    const p = predictTri(triFor(race.distance_km), inp);
    return p && p.range.mid ? p : null;
  }
  if (!m) return null;
  if (race.sport === "run") {
    const p = predictRun(m, inp);
    return p ? { key: "race", label: "Run", ...p } : null;
  }
  if (race.sport === "bike") {
    const r = predictBike(m, inp.ftp, inp.weightKg);
    return r ? { key: "race", label: "Bike", range: r, confidence: inp.weightKg ? "good" : "rough", drivers: [{ text: `FTP ${inp.ftp} W`, kind: "data" }, FLAT_NOTE] } : null;
  }
  if (race.sport === "swim") {
    const r = predictSwim(m, inp.css, m > 1600 ? 1.03 : 1);
    return r ? { key: "race", label: "Swim", range: r, confidence: "rough", drivers: [{ text: `CSS ${fmt(inp.css!)}/100 m`, kind: "data" }] } : null;
  }
  return null;
}

/** How a goal sits against the estimate. */
export function goalVerdict(goal: number | null, r: Range): { label: string; tone: "good" | "near" | "far" } | null {
  if (!goal || !r.mid) return null;
  if (goal >= r.mid) return { label: goal >= r.high ? "Goal looks comfortable" : "On track for the goal", tone: "good" };
  if (goal >= r.low) return { label: `Goal within reach (${fmt(r.mid - goal)} to find)`, tone: "near" };
  return { label: `Goal is a stretch: ${fmt(r.mid - goal)} faster than now`, tone: "far" };
}

/** Change since an earlier estimate, in seconds (negative = faster). Ignores noise under 0.5%. */
export function trendOf(now: number, before: number | null | undefined): number | null {
  if (!before || !now) return null;
  const d = now - before;
  return Math.abs(d) / before < 0.005 ? 0 : Math.round(d);
}
