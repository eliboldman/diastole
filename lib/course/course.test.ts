import assert from "node:assert/strict";
import { validateSteps } from "../workouts/garmin-format.ts";
import { bikeSpeed, buildCourse, cleanCourse, cleanPacing, courseSessions, courseTime, defaultPacing, parseGpx, readiness, runGradeFactor, segments } from "./course.ts";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok", name); };

// 10 km due north: flat 3 km, climb 1 km at 6%, flat, descent 1 km at -6%, flat.
function gpx(ele = true) {
  const pts: string[] = [];
  for (let i = 0; i <= 1000; i++) {
    const d = i * 10;
    let e = 100;
    if (d > 3000 && d <= 4000) e = 100 + (d - 3000) * 0.06;
    else if (d > 4000 && d <= 6000) e = 160;
    else if (d > 6000 && d <= 7000) e = 160 - (d - 6000) * 0.06;
    else if (d > 7000) e = 100;
    const lat = 40 + d / 111195;
    pts.push(`<trkpt lat="${lat.toFixed(7)}" lon="-90.0000000">${ele ? `<ele>${e.toFixed(1)}</ele>` : ""}</trkpt>`);
  }
  return `<?xml version="1.0"?><gpx><trk><trkseg>${pts.join("")}</trkseg></trk></gpx>`;
}
const course = buildCourse(parseGpx(gpx()));

t("parse + distance", () => {
  assert.equal(parseGpx(gpx()).length, 1001);
  assert.ok(Math.abs(course.distance_m - 10000) < 30, String(course.distance_m));
});
t("gain/loss", () => {
  assert.ok(Math.abs(course.gain_m - 60) < 6, String(course.gain_m));
  assert.ok(Math.abs(course.loss_m - 60) < 6, String(course.loss_m));
});
t("one climb found", () => {
  assert.equal(course.climbs.length, 1, JSON.stringify(course.climbs));
  const c = course.climbs[0];
  assert.ok(c.grade > 4.5 && c.grade < 7, String(c.grade));
  assert.ok(c.start_m > 2800 && c.start_m < 3200);
});
t("no elevation rejected", () => {
  assert.throws(() => buildCourse(parseGpx(gpx(false))), /elevation/);
  assert.throws(() => buildCourse(parseGpx("<gpx></gpx>")), /route/);
});
t("segments cover the course", () => {
  const s = segments(course);
  assert.equal(s[0].start_m, 0);
  assert.equal(s.at(-1)!.end_m, course.distance_m);
  assert.ok(s.some((x) => x.kind === "climb"));
  assert.ok(s.some((x) => x.kind === "descent"));
});
t("grade factors", () => {
  assert.equal(runGradeFactor(0), 1);
  assert.ok(runGradeFactor(5) > 1.15);
  assert.ok(runGradeFactor(-5) < 1 && runGradeFactor(-30) >= 0.82);
  assert.ok(bikeSpeed(250, 80, 6) < bikeSpeed(250, 80, 0));
  assert.ok(bikeSpeed(250, 80, -8) <= 16.7);
});
t("hilly course slower than flat", () => {
  const s = segments(course);
  const hilly = courseTime("run", s, { flatPace: 300 });
  assert.ok(hilly > 3000 && hilly < 3150, String(hilly));
  const b = courseTime("bike", s, { power: 220, massKg: 80 });
  assert.ok(b > 800 && b < 1300, String(b));
});
t("pacing defaults + clean", () => {
  const p = defaultPacing("bike", segments(course), { power: 200 });
  assert.ok(p.some((r) => r.target > 200) && p.some((r) => r.target < 200));
  assert.deepEqual(cleanPacing(p, "bike", course.distance_m), p);
  assert.equal(cleanPacing([{ start_m: 0, end_m: 99999, target: 200 }], "bike", course.distance_m), null);
  assert.equal(cleanPacing([{ start_m: 0, end_m: 100, target: 2000 }], "bike", course.distance_m), null);
});
t("readiness", () => {
  const r = readiness("run", course, 3000, [{ sport: "running", duration_s: 2400, distance_m: 8000, elevation_gain_m: 50 }], 1);
  assert.ok(r.score > 50 && r.score <= 100, String(r.score));
  assert.equal(r.parts.length, 3);
  const none = readiness("run", course, 3000, [], 0);
  assert.equal(none.parts[0].score, 0);
});
t("course sessions", () => {
  const run = courseSessions("run", course, { flatPace: 300 });
  assert.deepEqual(run.map((s) => s.key), ["hills", "race-pace"]);
  const bike = courseSessions("bike", course, { ftp: 250, massKg: 75 });
  assert.ok(bike.some((s) => s.key === "climb") && bike.some((s) => s.key === "sim"));
  assert.equal(courseSessions("bike", course, { ftp: null }).length, 1);
});
t("sessions are valid Garmin workouts", () => {
  for (const s of courseSessions("run", course, { flatPace: 300 })) assert.deepEqual(validateSteps(s.steps, 0, "run", null), [], s.key);
  for (const s of courseSessions("bike", course, { ftp: 250, massKg: 75 })) assert.deepEqual(validateSteps(s.steps, 0, "bike", null), [], s.key);
});
t("cleanCourse round-trips and rejects junk", () => {
  const c = cleanCourse(JSON.parse(JSON.stringify(course)))!;
  assert.equal(c.distance_m, course.distance_m);
  assert.equal(c.climbs.length, 1);
  assert.equal(cleanCourse({ ...course, distance_m: 1e9 }), null);
  assert.equal(cleanCourse({ ...course, profile: [[0, 1], [10, "x"]] }), null);
  assert.equal(cleanCourse({ ...course, path: [[0, 2], [0, 0]] }), null);
});
t("keeps the real route for trainer maps and ride GPS", () => {
  assert.ok(course.track && course.track.length === course.profile.length, "one point per profile distance");
  assert.equal(course.track![0][0], 0);
  assert.equal(course.track!.at(-1)![0], course.distance_m);
  const pts = parseGpx(gpx());
  assert.ok(Math.abs(course.track![0][1] - pts[0].lat) < 1e-4 && Math.abs(course.track![0][2] - pts[0].lon) < 1e-4, "starts at the first GPX point");
  assert.ok(Math.abs(course.track!.at(-1)![1] - pts.at(-1)!.lat) < 1e-4, "ends at the last");
  const clean = cleanCourse(course)!;
  assert.equal(clean.track!.length, course.track!.length, "survives cleaning");
  const bad = cleanCourse({ ...course, track: [[0, 95, 0], [10, 0, 0]] })!;
  assert.ok(bad && !bad.track, "a bad track is dropped, the course still saves");
  const old = cleanCourse({ ...course, track: undefined })!;
  assert.ok(old && !("track" in old), "courses from before maps still work");
});
console.log(`${n} passed`);
