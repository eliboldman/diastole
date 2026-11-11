// Threshold tests: the protocols an athlete follows, how a finished test is recognised, and how the
// new zone is read from the file. A test is an all-out effort, so unlike training efforts its result
// can lower a zone as well as raise it. Pure module (no server imports), testable with `node`.

import type { Lap, Streams } from "../activity/fit.ts";
import { bestAverage } from "../activity/bests.ts";
import type { Step } from "../workouts/garmin-format.ts";

export type TestKind = "ftp20" | "ramp" | "css" | "run30";
export type TestZoneKey = "ftp_w" | "threshold_speed_mps" | "css_sec_per_100m";

export const TEST_KINDS: TestKind[] = ["ftp20", "ramp", "css", "run30"];

export const TESTS: Record<TestKind, { title: string; sport: "bike" | "swim" | "run"; zone: TestZoneKey; short: string; description: string }> = {
  ftp20: {
    title: "FTP test (20 min)",
    sport: "bike",
    zone: "ftp_w",
    short: "20-minute bike test",
    description:
      "Sets your FTP, which every bike target is built from. Warm up as written, then ride the 20-minute block as hard as you can hold evenly: start a touch conservative and build in the last 5 minutes. Flat road or the trainer, rested legs, fueled like a hard session. Your FTP is 95% of the 20-minute average.",
  },
  ramp: {
    title: "Ramp test",
    sport: "bike",
    zone: "ftp_w",
    short: "Ramp test on the trainer",
    description:
      "A shorter way to set your FTP. On the trainer (ERG on if you have it), the target climbs 20 W every minute. Keep going until you can't hold the target any more, then stop and spin easy. Your FTP is 75% of your best minute. It suits riders who find a 20-minute effort hard to pace.",
  },
  css: {
    title: "CSS test (400 + 200)",
    sport: "swim",
    zone: "css_sec_per_100m",
    short: "400 + 200 swim time trials",
    description:
      "Sets your critical swim speed (CSS), the pace your swim sets and triathlon estimates use. After the warm-up, swim 400 as fast as you can hold, rest about 5 minutes with easy swimming, then 200 all out. Push-off starts, freestyle, press lap at the end of each. CSS comes from the difference between the two times.",
  },
  run30: {
    title: "Threshold run test (30 min)",
    sport: "run",
    zone: "threshold_speed_mps",
    short: "30-minute run test",
    description:
      "Sets your threshold pace, which every run target is built from. After the warm-up, run 30 minutes as hard as you can sustain evenly, on a flat route or a track (not a race). Your threshold pace is your average over the last 20 minutes, and your threshold heart rate comes from the same stretch.",
  },
};

const min = (m: number) => ({ type: "time" as const, seconds: Math.round(m * 60) });
const pct = (ftp: number | null, low: number, high: number) => (ftp ? { type: "power_range" as const, low: Math.round(ftp * low), high: Math.round(ftp * high) } : undefined);

/** The test as a workout. Bike targets are power (from the current FTP when there is one), runs heart-rate zones, swims effort. */
export function testSteps(kind: TestKind, zones: { ftp_w?: number | null } = {}): Step[] {
  const ftp = zones.ftp_w ? Number(zones.ftp_w) : null;
  switch (kind) {
    case "ftp20":
      return [
        { kind: "step", intensity: "WARMUP", duration: min(15), target: pct(ftp, 0.5, 0.65), note: "Easy, building gradually" },
        { kind: "repeat", times: 3, steps: [
          { kind: "step", intensity: "INTERVAL", duration: min(1), target: pct(ftp, 1.0, 1.1), note: "Brisk, high cadence" },
          { kind: "step", intensity: "RECOVERY", duration: min(1), target: pct(ftp, 0.45, 0.55), note: "Easy spin" },
        ] },
        { kind: "step", intensity: "RECOVERY", duration: min(5), target: pct(ftp, 0.45, 0.55), note: "Easy before the test" },
        { kind: "step", intensity: "ACTIVE", duration: min(20), note: "TEST: 20 min as hard as you can hold evenly. Build in the last 5." },
        { kind: "step", intensity: "COOLDOWN", duration: min(10), target: pct(ftp, 0.4, 0.55), note: "Easy spin" },
      ];
    case "ramp": {
      const ramp: Step[] = [];
      for (let w = 120; w <= 500; w += 20) ramp.push({ kind: "step", intensity: "INTERVAL", duration: min(1), target: { type: "power_range", low: w, high: w }, note: "Hold it until you can't" });
      return [
        { kind: "step", intensity: "WARMUP", duration: min(8), target: { type: "power_range", low: 90, high: 110 }, note: "Easy" },
        ...ramp,
        { kind: "step", intensity: "COOLDOWN", duration: { type: "open" }, target: { type: "power_range", low: 80, high: 100 }, note: "Spin easy once you stop" },
      ];
    }
    case "css":
      return [
        { kind: "step", intensity: "WARMUP", duration: { type: "distance", meters: 300 }, target: { type: "swim_effort", level: 3 }, stroke: "FREESTYLE", note: "Easy" },
        { kind: "repeat", times: 4, steps: [
          { kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: 50 }, target: { type: "swim_effort", level: 5 }, stroke: "FREESTYLE", note: "Build to fast" },
          { kind: "step", intensity: "REST", duration: { type: "time", seconds: 20 } },
        ] },
        { kind: "step", intensity: "REST", duration: { type: "time", seconds: 60 } },
        { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 400 }, target: { type: "swim_effort", level: 7 }, stroke: "FREESTYLE", note: "TEST: 400 as fast as you can hold. Press lap at the wall." },
        { kind: "step", intensity: "REST", duration: { type: "time", seconds: 300 }, note: "Easy swimming or rest, about 5 min" },
        { kind: "step", intensity: "MAIN", duration: { type: "distance", meters: 200 }, target: { type: "swim_effort", level: 7 }, stroke: "FREESTYLE", note: "TEST: 200 all out. Press lap at the wall." },
        { kind: "step", intensity: "COOLDOWN", duration: { type: "distance", meters: 200 }, target: { type: "swim_effort", level: 2 }, stroke: "CHOICE", note: "Easy" },
      ];
    case "run30":
      return [
        { kind: "step", intensity: "WARMUP", duration: min(15), target: { type: "hr_zone", zone: 2 }, note: "Easy, a few strides at the end" },
        { kind: "step", intensity: "ACTIVE", duration: min(30), note: "TEST: 30 min as hard as you can sustain evenly" },
        { kind: "step", intensity: "COOLDOWN", duration: min(10), target: { type: "hr_zone", zone: 1 }, note: "Easy jog or walk" },
      ];
  }
}

const RUN = /run|treadmill|track|trail/i;
const BIKE = /cycl|bik|ride|spin/i;
const SWIM = /swim/i;

/** Which test an activity was: the planned test it completed, else its name ("FTP test", "CSS test", "ramp test", "threshold run test"). */
export function detectTest(a: { name?: string | null; sport?: string | null; planned_test?: string | null }): TestKind | null {
  if (a.planned_test && (TEST_KINDS as string[]).includes(a.planned_test)) return a.planned_test as TestKind;
  const name = (a.name ?? "").toLowerCase();
  const sport = a.sport ?? "";
  if (!/test|\btt\b|time trial/.test(name)) return null;
  if (BIKE.test(sport) && !RUN.test(sport)) return /ramp/.test(name) ? "ramp" : /ftp|20/.test(name) ? "ftp20" : null;
  if (SWIM.test(sport) && /css|400|critical/.test(name)) return "css";
  if (RUN.test(sport) && /threshold|lthr|30/.test(name)) return "run30";
  return null;
}

export type TestResult = { kind: TestKind; key: TestZoneKey; value: number; why: string; thresholdHr?: number };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The new zone from a finished test, or null when the file doesn't hold a usable effort. */
export function analyzeTest(kind: TestKind, d: { streams?: Streams | null; laps?: Lap[] | null }): TestResult | null {
  const s = d.streams;
  if (kind === "ftp20" || kind === "ramp") {
    if (!s?.power?.length) return null;
    if (kind === "ftp20") {
      const p = bestAverage(s.power, s.interval_s, 1200);
      if (!p || p < 60 || p > 700) return null;
      const ftp = Math.round(p * 0.95);
      return { kind, key: "ftp_w", value: ftp, why: `Best 20 minutes: ${p} W, so FTP ≈ 95% of that.` };
    }
    const p = bestAverage(s.power, s.interval_s, 60);
    if (!p || p < 100 || p > 900) return null;
    const ftp = Math.round(p * 0.75);
    return { kind, key: "ftp_w", value: ftp, why: `Best minute of the ramp: ${p} W, so FTP ≈ 75% of that.` };
  }
  if (kind === "run30") return analyzeRun(s);
  return analyzeCss(d.laps ?? [], s?.pool ?? null);
}

/** Fastest 30 minutes in the file; threshold pace and heart rate are its last 20. */
function analyzeRun(s: Streams | null | undefined): TestResult | null {
  if (!s?.t?.length || !s.dist?.length) return null;
  const t = s.t;
  const dist = s.dist;
  let best: { i: number; j: number; v: number } | null = null;
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    if (dist[i] == null) continue;
    while (j < t.length && t[j] - t[i] < 1800) j++;
    if (j >= t.length) break;
    if (dist[j] == null) continue;
    const v = (dist[j]! - dist[i]!) / (t[j] - t[i]);
    if (!best || v > best.v) best = { i, j, v };
  }
  if (!best) return null;
  let k = best.i;
  while (k < best.j && t[best.j] - t[k] > 1200) k++;
  if (dist[k] == null) return null;
  const speed = (dist[best.j]! - dist[k]!) / (t[best.j] - t[k]);
  if (!(speed >= 2 && speed <= 6.5)) return null;
  const hrs = (s.hr ?? []).slice(k, best.j + 1).filter((h): h is number => h != null && h > 60);
  const thresholdHr = hrs.length > 10 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined;
  const perMi = 1609.344 / speed;
  return {
    kind: "run30",
    key: "threshold_speed_mps",
    value: Math.round(speed * 1000) / 1000,
    why: `Last 20 minutes of the 30: ${clock(perMi)}/mi (${clock(1000 / speed)}/km)${thresholdHr ? `, ${thresholdHr} bpm` : ""}.`,
    thresholdHr,
  };
}

/** CSS from the fastest ~400 and ~200 laps: (t400 − t200) per 100 of the distance between them. */
function analyzeCss(laps: Lap[], pool: Streams["pool"] | null): TestResult | null {
  const units = pool ? [pool.unit === "YARD" ? 0.9144 : 1] : [1, 0.9144];
  for (const u of units) {
    const near = (target: number) =>
      laps
        .filter((l) => l.distance_m && l.duration_s && Math.abs(l.distance_m - target * u) / (target * u) < 0.04)
        .sort((a, b) => a.duration_s! - b.duration_s!)[0];
    const l400 = near(400);
    const l200 = near(200);
    if (!l400 || !l200) continue;
    const d = l400.distance_m! - l200.distance_m!;
    const dt = l400.duration_s! - l200.duration_s!;
    if (d <= 0 || dt <= 0) continue;
    const css = (dt / d) * 100; // seconds per 100 m
    // The 400 must be slower per metre than the 200, and CSS has to be a believable swim pace.
    if (l400.duration_s! / l400.distance_m! <= l200.duration_s! / l200.distance_m! || css < 50 || css > 240) continue;
    const unitName = u === 1 ? "m" : "yd";
    return {
      kind: "css",
      key: "css_sec_per_100m",
      value: Math.round(css * 10) / 10,
      why: `400 ${unitName} in ${clock(l400.duration_s!)}, 200 ${unitName} in ${clock(l200.duration_s!)}: CSS ${clock(css * u)}/100 ${unitName}.`,
    };
  }
  return null;
}

export type DoneTest = { activity_id: string; start_time: string; result: TestResult };
type Zones = { ftp_w?: number | null; threshold_speed_mps?: number | null; css_sec_per_100m?: number | null; dismissed?: Record<string, number> | null } | null;
type TestSuggestion = {
  key: TestZoneKey;
  current: number | null;
  suggested: number;
  why: string;
  activity_id: string;
  date: string;
  test: { kind: TestKind; title: string; thresholdHr?: number };
};

/**
 * Zone updates from finished tests: the newest test per zone, unless the coach already applied or
 * passed on it, or it lands within 2% of the current zone. Up or down: a test is a real maximum.
 */
export function suggestFromTests(zones: Zones, done: DoneTest[]): TestSuggestion[] {
  const settled = zones?.dismissed ?? {};
  const newest = new Map<TestZoneKey, DoneTest>();
  for (const d of [...done].sort((a, b) => b.start_time.localeCompare(a.start_time))) if (!newest.has(d.result.key)) newest.set(d.result.key, d);
  const out: TestSuggestion[] = [];
  for (const [key, d] of newest) {
    if (settled[`test:${d.activity_id}`]) continue;
    const cur = zones?.[key] != null ? Number(zones[key]) : null;
    if (cur && Math.abs(d.result.value - cur) / cur < 0.02) continue;
    out.push({
      key,
      current: cur,
      suggested: d.result.value,
      why: `${TESTS[d.result.kind].title}: ${d.result.why}`,
      activity_id: d.activity_id,
      date: d.start_time,
      test: { kind: d.result.kind, title: TESTS[d.result.kind].title, ...(d.result.thresholdHr ? { thresholdHr: d.result.thresholdHr } : {}) },
    });
  }
  return out;
}

/** One suggestion per zone: a test beats a training effort unless the effort came after it. */
export function mergeWithTests<S extends { key: string; date: string }>(training: S[], tests: S[]): S[] {
  const out = [...tests];
  for (const s of training) {
    const t = tests.find((x) => x.key === s.key);
    if (!t) out.push(s);
    else if (s.date > t.date) out.splice(out.indexOf(t), 1, s);
  }
  return out;
}
