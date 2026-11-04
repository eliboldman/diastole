// Run with: node lib/activity/fit.test.ts
// Builds a synthetic run with Garmin's own encoder (no personal data), then parses it back.
import assert from "node:assert/strict";

import { Encoder, Profile } from "@garmin/fitsdk";

import { fitFileInfo, haversine, parseFit, trimRoute } from "./fit.ts";

// The SDK's message types are narrower than what it accepts; tests write plain objects.
const mesg = (o: Record<string, unknown>) => o as never;

const DEG_TO_SEMI = 2 ** 31 / 180;
const START: [number, number] = [41.0, -91.0];
const t0 = new Date("2026-11-03T13:00:00Z");
const SECONDS = 30 * 60;
const SPEED = 3.0; // m/s, out for 15 min (2.7 km), back for 15 min

function encodeRun({ power = 0, gps = true } = {}) {
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, mesg({ type: "activity", manufacturer: "garmin", product: 0, timeCreated: t0, serialNumber: 1 }));
  for (let i = 0; i <= SECONDS; i++) {
    const out = i <= SECONDS / 2 ? i : SECONDS - i; // seconds away from start
    const lat = START[0] + (out * SPEED) / 111_320; // due north and back
    enc.onMesg(Profile.MesgNum.RECORD, mesg({
      timestamp: new Date(t0.getTime() + i * 1000),
      heartRate: 130 + Math.round((i / SECONDS) * 30),
      enhancedSpeed: SPEED,
      enhancedAltitude: 200 + (out % 50),
      distance: i * SPEED,
      cadence: 85,
      fractionalCadence: 0.5,
      power,
      ...(gps ? { positionLat: Math.round(lat * DEG_TO_SEMI), positionLong: Math.round(START[1] * DEG_TO_SEMI) } : {}),
      verticalOscillation: 85 + (i / SECONDS) * 10,
      stanceTime: 240,
      stanceTimeBalance: 50.4,
      stepLength: 1060,
      verticalRatio: 7.6,
    }));
  }
  for (let k = 0; k < 3; k++) {
    enc.onMesg(Profile.MesgNum.LAP, mesg({
      timestamp: new Date(t0.getTime() + (k + 1) * 600_000),
      startTime: new Date(t0.getTime() + k * 600_000),
      totalTimerTime: 600,
      totalElapsedTime: 600,
      totalDistance: 1800,
      avgHeartRate: 140 + k * 5,
      maxHeartRate: 150 + k * 5,
      enhancedAvgSpeed: SPEED,
      avgCadence: 85,
      intensity: k === 0 ? "warmup" : "active",
      wktStepIndex: k,
    }));
  }
  enc.onMesg(Profile.MesgNum.SESSION, mesg({
    timestamp: new Date(t0.getTime() + SECONDS * 1000),
    startTime: t0,
    sport: "running",
    subSport: "generic",
    totalTimerTime: SECONDS,
    totalElapsedTime: SECONDS,
    totalDistance: SECONDS * SPEED,
    avgHeartRate: 145,
    maxHeartRate: 160,
    totalCalories: 400,
    totalAscent: 30,
    enhancedAvgSpeed: SPEED,
    avgCadence: 85,
    trainingLoadPeak: 62.4,
  }));
  return enc.close();
}

const run = parseFit(encodeRun());

// Summary
assert.equal(run.summary.sport, "running");
assert.equal(run.summary.start_time, t0.toISOString());
assert.equal(run.summary.duration_s, SECONDS);
assert.equal(run.summary.distance_m, SECONDS * SPEED);
assert.equal(run.summary.avg_hr, 145);
assert.equal(run.summary.calories, 400);
assert.equal(run.summary.avg_cadence, 170, "running cadence reported as steps per minute");
assert.equal(run.summary.training_load, 62.4);
assert.equal(run.summary.avg_power, null, "no power meter: null, not 0");

// Streams: resampled to 5 s, missing sensors left out, units converted
assert.equal(run.streams.interval_s, 5);
assert.ok(run.streams.t.length >= 360 && run.streams.t.length <= 362, `got ${run.streams.t.length} points`);
assert.equal(run.streams.power, undefined, "all-zero power stream is dropped");
assert.equal(run.streams.cadence?.[0], 171, "85.5 strides/min -> 171 steps/min");
assert.equal(run.streams.stride?.[0], 1.06, "stride length in metres");
assert.equal(run.streams.gct?.[0], 240);
assert.ok(run.streams.vo![0]! < run.streams.vo![run.streams.vo!.length - 1]!, "vertical oscillation rises with fatigue in the sample");
assert.equal(run.streams.dist?.[1], 9 * SPEED, "distance keeps the bucket's furthest point");
assert.ok(run.record_fields.includes("stanceTime") && run.record_fields.includes("positionLat"));

// Laps
assert.equal(run.laps.length, 3);
assert.deepEqual(
  run.laps.map((l) => [l.start_s, l.duration_s, l.intensity, l.step_index]),
  [
    [0, 600, "warmup", 0],
    [600, 600, "active", 1],
    [1200, 600, "active", 2],
  ],
);
assert.equal(run.laps[0].avg_cadence, 170);

// Route: present, and nothing within 200 m of the start (this run starts and finishes at the same spot)
assert.ok(run.route && run.route.length >= 10);
for (const p of run.route!) assert.ok(haversine(p, START) > 200, `point ${p} is within 200 m of the start`);

// Power present when a meter records it
assert.equal(parseFit(encodeRun({ power: 250 })).streams.power?.[0], 250);

// No GPS (treadmill, pool): no route
assert.equal(parseFit(encodeRun({ gps: false })).route, null);

// A loop that never leaves the trim radius yields no route at all
const tiny: [number, number][] = Array.from({ length: 50 }, (_, i) => [START[0] + (i % 10) * 0.0001, START[1]]);
assert.equal(trimRoute(tiny), null);

// Garbage in: a clear error, not a crash
assert.throws(() => parseFit(new Uint8Array([1, 2, 3, 4])), /Not a FIT file/);

// Quick file info for the export scan
assert.deepEqual(fitFileInfo(encodeRun()), { type: "activity", start: t0.toISOString() });
{
  const enc = new Encoder();
  enc.onMesg(Profile.MesgNum.FILE_ID, mesg({ type: "monitoringB", manufacturer: "garmin", product: 0, timeCreated: t0, serialNumber: 1 }));
  assert.deepEqual(fitFileInfo(enc.close()), { type: "monitoringB", start: null });
}
assert.deepEqual(fitFileInfo(new Uint8Array([9, 9, 9])), { type: null, start: null });

console.log("fit: all passed");
