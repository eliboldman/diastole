import assert from "node:assert/strict";

import { calmShift, cycle, holdBand, holdTrend, nightsEffect, pickPace, streak, suggest, type DayContext, type SessionRow } from "./plan.ts";
import { breathSwing, parseHeartRate, rmssd, summarise, type HrSample } from "./hr.ts";

const total = (k: Parameters<typeof cycle>[0], p?: number, prog?: number) => cycle(k, p, prog).reduce((a, x) => a + x.seconds, 0);

// Cycles
assert.ok(Math.abs(total("resonance", 5.5) - 60 / 5.5) < 1e-9, "exactly 5.5 a minute");
assert.equal(total("resonance", 6), 10);
assert.equal(total("resonance", 99), 5, "pace clamps to 12/min");
assert.equal(total("box"), 16);
assert.equal(cycle("downshift", 5.5, 0)[1].seconds, 6);
assert.equal(cycle("downshift", 5.5, 0.9)[1].seconds, 8);
assert.ok(cycle("sigh").some((p) => p.kind === "top"));

// Pace finder
assert.equal(pickPace({ "6.5": 2, "6": 4, "5.5": 3, "5": 4, "4.5": 1 }), 6, "equal distance from 5.5 → the quicker pace");
assert.equal(pickPace({ "6.5": 5, "5.5": 5 }), 5.5, "tie → nearer 5.5");
assert.equal(pickPace({ "4.5": 5, "5.5": 2 }), 4.5);
assert.equal(pickPace({ "7": 5 }), null, "unknown paces ignored");
assert.equal(pickPace({}), null);
const rated = { "6.5": 4, "6": 4, "5.5": 4, "5": 2, "4.5": 3 };
assert.equal(pickPace(rated, { "6.5": 6, "6": 9, "5.5": 11, "5": 14, "4.5": 8 }), 5.5, "biggest swing among paces that felt OK");
assert.equal(pickPace({ ...rated, "6.5": 5 }, { "6.5": 6, "6": 9 }), 6.5, "too few swings → ratings");
assert.equal(pickPace({ "6.5": 1, "6": 1, "5.5": 2, "5": 1 }, { "6.5": 6, "6": 9, "5.5": 7, "5": 12 }), 5, "none felt OK → biggest swing overall");

// Suggestions
const base: DayContext = { hour: 10, readiness: null, trainedMinutes: 0, hardToday: false, raceToday: false, raceTomorrow: false, doneToday: [] };
assert.equal(suggest(base).kind, "sigh");
assert.equal(suggest({ ...base, raceToday: true, hour: 7 }).kind, "box");
assert.equal(suggest({ ...base, raceToday: true, hour: 7, doneToday: ["box"] }).kind, "sigh");
assert.equal(suggest({ ...base, hour: 22 }).kind, "downshift");
assert.match(suggest({ ...base, hour: 21, raceTomorrow: true }).why, /night before/);
assert.equal(suggest({ ...base, hour: 15, trainedMinutes: 90 }).kind, "resonance");
assert.equal(suggest({ ...base, hour: 15, hardToday: true, doneToday: ["resonance"] }).kind, "sigh");
assert.equal(suggest({ ...base, readiness: "red" }).kind, "resonance");
assert.equal(suggest({ ...base, raceTomorrow: true }).minutes, 5);

// Holds
assert.equal(holdBand(10).label, "Low");
assert.equal(holdBand(30).label, "Good");
assert.equal(holdBand(45).label, "Great");
assert.equal(holdTrend([{ taken_on: "2026-11-01", seconds: 20 }]), null);
assert.deepEqual(
  holdTrend([18, 20, 22, 25, 28, 30].map((s, i) => ({ taken_on: `2026-11-0${i + 1}`, seconds: s }))),
  { from: 20, to: 28, change: 8 },
);

// Nights effect
const day = (i: number) => new Date(Date.parse("2026-10-01T12:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
const sessions: SessionRow[] = [];
const nights = [];
for (let i = 0; i < 20; i++) {
  const breathed = i % 2 === 0;
  if (breathed) sessions.push({ kind: "downshift", local_date: day(i), local_hour: 21, calm_before: 2, calm_after: 4 });
  nights.push({ date: day(i + 1), hrv_ms: breathed ? 66 : 60, resting_hr: breathed ? 48 : 50 });
}
const eff = nightsEffect(sessions, nights);
assert.ok(eff.ready);
if (eff.ready) {
  assert.equal(eff.hrvPct, 10);
  assert.equal(eff.rhrDiff, -2);
  assert.equal(eff.after, 10);
}
// Morning sessions and the finder don't count as evening breathing.
const morning = sessions.map((s) => ({ ...s, local_hour: 8 }));
assert.equal(nightsEffect(morning, nights).ready, false);
assert.equal(nightsEffect(sessions.slice(0, 3), nights).ready, false);

assert.deepEqual(calmShift(sessions), { n: 10, change: 2 });
assert.equal(calmShift(sessions.slice(0, 2)), null);

// Streak
assert.equal(streak(["2026-11-21", "2026-11-22", "2026-11-23"], "2026-11-23"), 3);
assert.equal(streak(["2026-11-21", "2026-11-22"], "2026-11-23"), 2, "yesterday still counts");
assert.equal(streak(["2026-11-20"], "2026-11-23"), 0);

// Heart rate
const pkt = (bytes: number[]) => parseHeartRate(new DataView(new Uint8Array(bytes).buffer));
assert.deepEqual(pkt([0x00, 62]), { bpm: 62, rr: [] });
assert.deepEqual(pkt([0x01, 0x2c, 0x01]), { bpm: null, rr: [] }, "300 bpm rejected");
assert.deepEqual(pkt([0x10, 60, 0x00, 0x04, 0x00, 0x04]), { bpm: 60, rr: [1000, 1000] }, "RR in 1/1024 s");
assert.deepEqual(pkt([0x18, 60, 0x10, 0x00, 0x00, 0x04]), { bpm: 60, rr: [1000] }, "skips energy field");
assert.deepEqual(pkt([0x00]), { bpm: null, rr: [] });

// A heart rate that swings ±5 bpm with a 10 s breath → about 10 bpm peak to trough.
const wave: HrSample[] = Array.from({ length: 300 }, (_, t) => ({ t, bpm: 60 + 5 * Math.sin((2 * Math.PI * t) / 10) }));
const sw = breathSwing(wave, 10)!;
assert.ok(sw > 9 && sw <= 10, `swing ${sw}`);
assert.equal(breathSwing(wave.slice(0, 40), 10), null, "too short");
assert.equal(rmssd([1000, 1010, 990]), null, "too few beats");
const beats = Array.from({ length: 60 }, (_, i) => (i % 2 ? 1040 : 1000));
assert.equal(rmssd(beats), 40);
assert.equal(rmssd([...beats.slice(0, 30), 400, ...beats.slice(30)]), 40, "artifact dropped");
const falling: HrSample[] = Array.from({ length: 600 }, (_, t) => ({ t, bpm: 70 - t / 60 }));
const sum = summarise(falling, [], 10)!;
assert.equal(sum.start, 70);
assert.equal(sum.end, 61);

console.log("breath: all good");
