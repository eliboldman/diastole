// Race courses from a GPX file: elevation profile, climbs, a route outline, course-aware time
// estimates (grade-adjusted run pace; bike power physics on each grade), a default pacing plan,
// course readiness from recent training, and course-specific sessions. Pure module, testable with `node`.

import type { Step } from "../workouts/garmin-format.ts";

export type Leg = "run" | "bike";
export type Climb = { start_m: number; end_m: number; gain_m: number; grade: number }; // grade in %
export type Course = {
  distance_m: number;
  gain_m: number;
  loss_m: number;
  min_ele: number;
  max_ele: number;
  profile: [number, number][]; // [distance m, elevation m]
  path: [number, number][]; // route outline, normalized 0..1 (x east, y south)
  climbs: Climb[];
  /** The real route, [distance m, lat, lon] at the profile's distances (courses added since trainer maps). */
  track?: [number, number, number][];
};
export type Segment = { start_m: number; end_m: number; grade: number; gain_m: number; kind: "climb" | "descent" | "rolling" };
export type PaceRow = { start_m: number; end_m: number; grade: number; target: number; note: string }; // run: s/km, bike: W
export type Pt = { lat: number; lon: number; ele: number | null };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
const hav = (a: Pt, b: Pt) => {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const round1 = (v: number) => Math.round(v * 10) / 10;
const round5 = (v: number) => Math.round(v * 1e5) / 1e5; // ~1 m

/** Track or route points from GPX text (trkpt, rtept, or wpt as a last resort). */
export function parseGpx(text: string): Pt[] {
  const out: Pt[] = [];
  for (const tag of ["trkpt", "rtept", "wpt"]) {
    const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const lat = Number(/lat\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1])?.[1]);
      const lon = Number(/lon\s*=\s*["']([-\d.eE+]+)["']/.exec(m[1])?.[1]);
      const eleRaw = m[2] ? /<ele>\s*([-\d.eE+]+)\s*<\/ele>/.exec(m[2])?.[1] : undefined;
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ lat, lon, ele: eleRaw !== undefined && Number.isFinite(Number(eleRaw)) ? Number(eleRaw) : null });
    }
    if (out.length >= 2) return out;
    out.length = 0;
  }
  return out;
}

/** Elevation at a distance along cumulative samples (linear). */
function eleAt(ds: number[], es: number[], d: number) {
  let lo = 0;
  let hi = ds.length - 1;
  if (d <= ds[0]) return es[0];
  if (d >= ds[hi]) return es[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ds[mid] <= d) lo = mid;
    else hi = mid;
  }
  const f = ds[hi] === ds[lo] ? 0 : (d - ds[lo]) / (ds[hi] - ds[lo]);
  return es[lo] + f * (es[hi] - es[lo]);
}

/** Climbs: stretches of 300 m+ averaging 3%+ that gain 15 m+, merged across short dips. */
export function findClimbs(profile: [number, number][]): Climb[] {
  const climbs: Climb[] = [];
  const n = profile.length;
  let i = 0;
  while (i < n - 1) {
    // Start where the road turns up.
    if (profile[i + 1][1] <= profile[i][1]) {
      i++;
      continue;
    }
    let lowI = i;
    let highI = i;
    let j = i + 1;
    while (j < n) {
      if (profile[j][1] > profile[highI][1]) highI = j;
      // Stop once we've dropped 10 m below the high point, or 400 m past it.
      if (profile[highI][1] - profile[j][1] > 10 || profile[j][0] - profile[highI][0] > 400) break;
      j++;
    }
    const len = profile[highI][0] - profile[lowI][0];
    const gain = profile[highI][1] - profile[lowI][1];
    if (len >= 300 && gain >= 15 && (gain / len) * 100 >= 3) {
      climbs.push({ start_m: Math.round(profile[lowI][0]), end_m: Math.round(profile[highI][0]), gain_m: Math.round(gain), grade: round1((gain / len) * 100) });
      lowI = highI;
    }
    i = Math.max(highI, i + 1);
  }
  return climbs;
}

/** Course from GPX points. Throws a plain-language error when the file can't be used. */
export function buildCourse(pts: Pt[]): Course {
  if (pts.length < 10) throw new Error("That file doesn't have a route in it.");
  const ds = [0];
  for (let i = 1; i < pts.length; i++) ds.push(ds[i - 1] + hav(pts[i - 1], pts[i]));
  const total = ds.at(-1)!;
  if (total < 500) throw new Error("That route is under half a kilometre.");
  if (total > 400000) throw new Error("That route is over 400 km.");
  const withEle = pts.filter((p) => p.ele !== null).length;
  if (withEle < pts.length * 0.8) throw new Error("That file has no elevation. Export it again with elevation included.");
  // Fill gaps, then smooth over ~60 m so GPS/barometer noise doesn't count as climbing.
  const raw = pts.map((p, i) => p.ele ?? pts.slice(0, i).reverse().find((q) => q.ele !== null)?.ele ?? 0);
  const step = Math.max(25, total / 4000);
  const grid: number[] = [];
  for (let d = 0; d <= total; d += step) grid.push(d);
  if (grid.at(-1)! < total) grid.push(total);
  const g = grid.map((d) => eleAt(ds, raw, d));
  const win = Math.max(1, Math.round(60 / step));
  const smooth = g.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - win); k <= Math.min(g.length - 1, i + win); k++) {
      s += g[k];
      c++;
    }
    return s / c;
  });
  let gain = 0;
  let loss = 0;
  let ref = smooth[0];
  for (const e of smooth) {
    // 1 m hysteresis.
    if (e - ref >= 1) {
      gain += e - ref;
      ref = e;
    } else if (ref - e >= 1) {
      loss += ref - e;
      ref = e;
    }
  }
  // Keep about 1,000 profile points.
  const every = Math.max(1, Math.ceil(grid.length / 1000));
  const profile: [number, number][] = [];
  for (let i = 0; i < grid.length; i += every) profile.push([Math.round(grid[i]), round1(smooth[i])]);
  if (profile.at(-1)![0] !== Math.round(total)) profile.push([Math.round(total), round1(smooth.at(-1)!)]);
  // Route outline: equirectangular, about 300 points, normalized to the larger side.
  const lat0 = rad(pts.reduce((a, p) => a + p.lat, 0) / pts.length);
  const xs = pts.map((p) => p.lon * Math.cos(lat0));
  const ys = pts.map((p) => -p.lat);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pEvery = Math.max(1, Math.ceil(pts.length / 300));
  const path: [number, number][] = [];
  for (let i = 0; i < pts.length; i += pEvery) path.push([Math.round(((xs[i] - minX) / span) * 1000) / 1000, Math.round(((ys[i] - minY) / span) * 1000) / 1000]);
  path.push([Math.round(((xs.at(-1)! - minX) / span) * 1000) / 1000, Math.round(((ys.at(-1)! - minY) / span) * 1000) / 1000]);
  const eles = profile.map((p) => p[1]);
  // Real coordinates at each profile distance, for the trainer map and the ride file's GPS track.
  const track: [number, number, number][] = [];
  let k = 0;
  for (const [d] of profile) {
    while (k < ds.length - 2 && ds[k + 1] < d) k++;
    const span = ds[k + 1] - ds[k];
    const f = span > 0 ? Math.min(1, Math.max(0, (d - ds[k]) / span)) : 0;
    track.push([d, round5(pts[k].lat + (pts[k + 1].lat - pts[k].lat) * f), round5(pts[k].lon + (pts[k + 1].lon - pts[k].lon) * f)]);
  }
  return { distance_m: Math.round(total), gain_m: Math.round(gain), loss_m: Math.round(loss), min_ele: Math.round(Math.min(...eles)), max_ele: Math.round(Math.max(...eles)), profile, path, climbs: findClimbs(profile), track };
}

/** Check a course built in the browser before storing it (shape, sizes, sane numbers; climbs recomputed). */
export function cleanCourse(raw: unknown): Course | null {
  const c = raw as Course;
  const num = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!c || !num(c.distance_m, 500, 400000) || !num(c.gain_m, 0, 20000) || !num(c.loss_m, 0, 20000)) return null;
  if (!Array.isArray(c.profile) || c.profile.length < 2 || c.profile.length > 1100) return null;
  if (!Array.isArray(c.path) || c.path.length < 2 || c.path.length > 400) return null;
  let prev = -1;
  for (const p of c.profile) {
    if (!Array.isArray(p) || !num(p[0], 0, 400000) || !num(p[1], -500, 9000) || p[0] < prev) return null;
    prev = p[0];
  }
  for (const p of c.path) if (!Array.isArray(p) || !num(p[0], 0, 1) || !num(p[1], 0, 1)) return null;
  const profile = c.profile.map((p) => [Math.round(p[0]), round1(p[1])] as [number, number]);
  const eles = profile.map((p) => p[1]);
  // Optional real route: dropped (not rejected) if it doesn't check out, so the course still saves.
  let track: [number, number, number][] | undefined;
  if (Array.isArray(c.track) && c.track.length >= 2 && c.track.length <= 1100) {
    let last = -1;
    const ok = c.track.every((t) => {
      const good = Array.isArray(t) && num(t[0], 0, 400000) && t[0] >= last && num(t[1], -90, 90) && num(t[2], -180, 180);
      if (good) last = t[0];
      return good;
    });
    if (ok) track = c.track.map((t) => [Math.round(t[0]), round5(t[1]), round5(t[2])] as [number, number, number]);
  }
  return {
    distance_m: Math.round(c.distance_m),
    gain_m: Math.round(c.gain_m),
    loss_m: Math.round(c.loss_m),
    min_ele: Math.round(Math.min(...eles)),
    max_ele: Math.round(Math.max(...eles)),
    profile,
    path: c.path.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000] as [number, number]),
    climbs: findClimbs(profile),
    ...(track ? { track } : {}),
  };
}

/** Segments for pacing: each climb, the stretches between split into roughly equal parts. */
export function segments(c: Course, parts = 8): Segment[] {
  const cuts = new Set<number>([0, c.distance_m]);
  for (const cl of c.climbs) {
    cuts.add(cl.start_m);
    cuts.add(cl.end_m);
  }
  const chunk = c.distance_m / parts;
  const sorted = [...cuts].sort((a, b) => a - b);
  const all: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const isClimb = c.climbs.some((cl) => cl.start_m === a && cl.end_m === b);
    const pieces = isClimb ? 1 : Math.max(1, Math.round((b - a) / chunk));
    for (let k = 0; k < pieces; k++) all.push(a + ((b - a) * k) / pieces);
  }
  all.push(c.distance_m);
  const ds = c.profile.map((p) => p[0]);
  const es = c.profile.map((p) => p[1]);
  const out: Segment[] = [];
  for (let i = 0; i < all.length - 1; i++) {
    const a = Math.round(all[i]);
    const b = Math.round(all[i + 1]);
    if (b - a < 50) continue;
    const gainNet = eleAt(ds, es, b) - eleAt(ds, es, a);
    const grade = round1((gainNet / (b - a)) * 100);
    const isClimb = c.climbs.some((cl) => cl.start_m === a && cl.end_m === b);
    out.push({ start_m: a, end_m: b, grade, gain_m: Math.round(gainNet), kind: isClimb || grade >= 2.5 ? "climb" : grade <= -2.5 ? "descent" : "rolling" });
  }
  return out;
}

/** Run pace factor for a grade (%): uphill costs about 3.3% per 1%, downhill gives back about half that. */
export const runGradeFactor = (grade: number) => (grade >= 0 ? 1 + 0.033 * Math.min(grade, 20) : Math.max(0.82, 1 - 0.018 * Math.min(-grade, 10)));

/** Bike speed (m/s) at a power on a grade, CdA 0.30, descents capped at 60 km/h. */
export function bikeSpeed(watts: number, massKg: number, grade: number): number {
  const p = watts * 0.975;
  const th = Math.atan(grade / 100);
  const resist = (v: number) => 0.5 * 1.2 * 0.3 * v ** 3 + massKg * 9.81 * v * (0.004 * Math.cos(th) + Math.sin(th));
  let lo = 0.5;
  let hi = 25;
  for (let i = 0; i < 60; i++) {
    const v = (lo + hi) / 2;
    if (resist(v) > p) hi = v;
    else lo = v;
  }
  return Math.min(16.7, (lo + hi) / 2);
}

/** Pacing: a bit more power up the climbs, ease off down the descents (average power stays close). */
export const bikePowerFor = (base: number, grade: number) => Math.round(base * (grade >= 2.5 ? 1.06 : grade <= -2.5 ? 0.75 : 1));

/** Seconds for the course. Run: flat pace (s/km) adjusted by grade. Bike: power physics per segment. */
export function courseTime(leg: Leg, segs: Segment[], opts: { flatPace?: number; power?: number; massKg?: number }): number {
  let t = 0;
  for (const s of segs) {
    const len = s.end_m - s.start_m;
    if (leg === "run") t += (len / 1000) * (opts.flatPace ?? 300) * runGradeFactor(s.grade);
    else t += len / bikeSpeed(bikePowerFor(opts.power ?? 200, s.grade), opts.massKg ?? 80, s.grade);
  }
  return Math.round(t);
}

/** Default pacing plan from the course: a target per segment and a cue. */
export function defaultPacing(leg: Leg, segs: Segment[], opts: { flatPace?: number; power?: number }): PaceRow[] {
  return segs.map((s) => {
    const target = leg === "run" ? Math.round((opts.flatPace ?? 300) * runGradeFactor(s.grade)) : bikePowerFor(opts.power ?? 200, s.grade);
    const note =
      s.kind === "climb"
        ? leg === "run"
          ? "Climb: same effort, shorter steps. Let the pace go."
          : "Climb: hold the power, not the speed. Stay seated."
        : s.kind === "descent"
          ? leg === "run"
            ? "Downhill: quick feet, let gravity work."
            : "Descent: tuck, spin easy, take a drink."
          : "Settle in at target.";
    return { start_m: s.start_m, end_m: s.end_m, grade: s.grade, target, note };
  });
}

/** Clean a pacing plan edited in the browser against the course. */
export function cleanPacing(raw: unknown, leg: Leg, distance: number): PaceRow[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) return null;
  const rows: PaceRow[] = [];
  for (const r of raw) {
    const start = Math.round(Number(r?.start_m));
    const end = Math.round(Number(r?.end_m));
    const target = Math.round(Number(r?.target));
    if (!(start >= 0 && end > start && end <= distance + 5)) return null;
    if (leg === "run" ? !(target >= 120 && target <= 1200) : !(target >= 30 && target <= 700)) return null;
    rows.push({ start_m: start, end_m: end, grade: round1(Number(r?.grade) || 0), target, note: String(r?.note ?? "").slice(0, 120) });
  }
  return rows;
}

// ---------------------------------------------------------------- readiness

export type RecentSession = { sport: string | null; duration_s: number | null; distance_m: number | null; elevation_gain_m: number | null };
export type Readiness = { score: number; parts: { key: "endurance" | "climbing" | "specific"; label: string; score: number; detail: string }[] };

/**
 * How ready recent training (last 6 weeks) looks for this course: longest session vs the race's
 * length, climbing per km vs the course's, and course sessions done.
 */
export function readiness(leg: Leg, course: Course, raceSeconds: number, recent: RecentSession[], courseSessionsDone: number): Readiness {
  const re = leg === "run" ? /run|treadmill|trail|track/i : /cycl|bik|ride|spin/i;
  const mine = recent.filter((s) => re.test(s.sport ?? "") && (s.duration_s ?? 0) > 600);
  const longest = Math.max(0, ...mine.map((s) => s.duration_s ?? 0));
  const need = Math.min(leg === "run" ? 2.5 * 3600 : 5 * 3600, raceSeconds * (leg === "run" ? 0.75 : 0.8));
  const endurance = need ? Math.min(1, longest / need) : 1;
  const courseGpk = course.gain_m / (course.distance_m / 1000);
  const hilly = mine.filter((s) => (s.distance_m ?? 0) > 2000).map((s) => (s.elevation_gain_m ?? 0) / ((s.distance_m ?? 1) / 1000));
  const top = hilly.sort((a, b) => b - a).slice(0, 3);
  const mineGpk = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
  const climbing = courseGpk < 5 ? 1 : Math.min(1, mineGpk / courseGpk);
  const specific = Math.min(1, courseSessionsDone / 3);
  const h = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
  const parts: Readiness["parts"] = [
    { key: "endurance", label: "Long enough", score: Math.round(endurance * 100), detail: longest ? `Longest ${leg} in 6 weeks: ${h(longest)} (aim for about ${h(need)})` : `No ${leg}s over 10 minutes in 6 weeks` },
    { key: "climbing", label: "Hills", score: Math.round(climbing * 100), detail: courseGpk < 5 ? "Flat course" : `Course climbs ${Math.round(courseGpk)} m per km; your hilliest sessions ${Math.round(mineGpk)}` },
    { key: "specific", label: "Course sessions", score: Math.round(specific * 100), detail: `${courseSessionsDone} of 3 done` },
  ];
  const score = Math.round(endurance * 45 + climbing * 35 + specific * 20);
  return { score, parts };
}

// ---------------------------------------------------------------- course sessions

export type CourseSession = { key: string; title: string; description: string; steps: Step[] };

/** Sessions that rehearse the course: hill reps matching its main climb, race-pace work, and (bike) a course simulation. */
export function courseSessions(leg: Leg, course: Course, opts: { flatPace?: number | null; ftp?: number | null; massKg?: number }): CourseSession[] {
  const out: CourseSession[] = [];
  const main = [...course.climbs].sort((a, b) => b.gain_m - a.gain_m)[0];
  const wu: Step = { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: leg === "run" ? 900 : 1200 } };
  const cd: Step = { kind: "step", intensity: "COOLDOWN", duration: { type: "time", seconds: 600 } };
  if (main) {
    const len = main.end_m - main.start_m;
    if (leg === "run") {
      const secs = Math.min(300, Math.max(60, Math.round(((len / 1000) * (opts.flatPace ?? 300) * runGradeFactor(main.grade)) / 2 / 15) * 15));
      const reps = Math.max(4, Math.min(10, Math.round(1500 / secs)));
      out.push({
        key: "hills",
        title: `Course hills: ${reps} × ${Math.round(secs / 60 * 10) / 10} min`,
        description: `Rehearses the ${Math.round(len / 100) / 10} km climb at ${main.grade}% (from ${Math.round(main.start_m / 100) / 10} km). Find a hill around ${Math.round(main.grade)}%, run up at strong, controlled effort, jog back down.`,
        steps: [wu, { kind: "repeat", times: reps, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: secs }, target: { type: "hr_zone", zone: 4 }, note: `Uphill, ~${Math.round(main.grade)}%` }, { kind: "step", intensity: "RECOVERY", duration: { type: "open" }, note: "Jog back down" }] }, cd],
      });
    } else {
      const mass = opts.massKg ?? 80;
      const climbSecs = len / bikeSpeed((opts.ftp ?? 200) * 0.95, mass, main.grade);
      const secs = Math.min(1200, Math.max(240, Math.round(climbSecs / 60) * 60));
      const reps = Math.max(2, Math.min(5, Math.round(2400 / secs)));
      const target = opts.ftp ? ({ type: "power_range", low: Math.round(opts.ftp * 0.92), high: Math.round(opts.ftp * 0.98) } as const) : ({ type: "hr_zone", zone: 4 } as const);
      out.push({
        key: "climb",
        title: `Climb rehearsal: ${reps} × ${Math.round(secs / 60)} min`,
        description: `The ${Math.round(len / 100) / 10} km climb at ${main.grade}% takes about ${Math.round(climbSecs / 60)} min at race effort. Ride a similar hill (or the trainer) seated, smooth power.`,
        steps: [wu, { kind: "repeat", times: reps, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: secs }, target, note: "Seated, steady power" }, { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: Math.round(secs / 2) } }] }, cd],
      });
    }
  }
  if (leg === "run" && opts.flatPace) {
    const p = opts.flatPace;
    const blockM = Math.max(1000, Math.min(5000, Math.round(course.distance_m / 6 / 500) * 500));
    out.push({
      key: "race-pace",
      title: `Race-pace rehearsal: 3 × ${blockM / 1000} km`,
      description: "Locks in race pace so it feels familiar on the day. If the course is hilly, run these on similar terrain by effort.",
      steps: [wu, { kind: "repeat", times: 3, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "distance", meters: blockM }, target: { type: "pace_range", slowSecPerKm: Math.round(p * 1.02), fastSecPerKm: Math.round(p * 0.98) } }, { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 120 } }] }, cd],
    });
  }
  if (leg === "bike" && opts.ftp) {
    // Course simulation: the first ~90 min of the course, segment by segment at race power.
    const base = opts.ftp * 0.8;
    const segs = segments(course, 10);
    const steps: Step[] = [wu];
    let total = 0;
    for (const s of segs) {
      if (total >= 5400) break;
      const w = bikePowerFor(base, s.grade);
      const secs = Math.round((s.end_m - s.start_m) / bikeSpeed(w, opts.massKg ?? 80, s.grade) / 30) * 30;
      if (secs < 60) continue;
      steps.push({ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: Math.min(secs, 5400 - total) }, target: { type: "power_range", low: Math.round(w * 0.97), high: Math.round(w * 1.03) }, note: `${Math.round(s.start_m / 100) / 10}–${Math.round(s.end_m / 100) / 10} km, ${s.grade > 0 ? "+" : ""}${s.grade}%` });
      total += Math.min(secs, 5400 - total);
    }
    steps.push(cd);
    if (steps.length > 3)
      out.push({ key: "sim", title: "Course simulation", description: "The course segment by segment at race power. Best on a smart trainer, or outdoors by feel.", steps });
  }
  return out;
}
