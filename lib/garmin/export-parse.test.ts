// Run with: node lib/garmin/export-parse.test.ts
// Synthetic samples shaped like a real Garmin export (no personal data).
import assert from "node:assert/strict";

import { kindOf, parseExportFile } from "./export-parse.ts";

// File matching: by name, anywhere under DI_CONNECT; nothing outside it, no nested zips.
assert.equal(kindOf("DI_CONNECT/DI-Connect-Wellness/2026-01-01_2026-04-10_123_sleepData.json"), "sleep");
assert.equal(kindOf("DI_CONNECT/DI-Connect-Aggregator/UDSFile_2026-01-01_2026-04-10.json"), "daily");
assert.equal(kindOf("DI_CONNECT/Some-New-Folder/UDSFile_x.json"), "daily");
assert.equal(kindOf("DI_CONNECT/DI-Connect-Fitness/me@x.com_1_summarizedActivities.json"), "activities");
assert.equal(kindOf("DI_CONNECT/DI-Connect-Metrics/TrainingReadinessDTO_20260101_20260410_1.json"), "readiness");
assert.equal(kindOf("DI_CONNECT/DI-Connect-User/user_profile.json"), null);
assert.equal(kindOf("IT_ORDERS/orders.json"), null);
assert.equal(kindOf("DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip"), null);
assert.equal(kindOf("UDSFile_outside.json"), null);

const sleep = parseExportFile(
  "sleep",
  JSON.stringify([
    { calendarDate: "2026-03-01", deepSleepSeconds: 7380, lightSleepSeconds: 13020, remSleepSeconds: 6960, awakeSleepSeconds: 1140, sleepScores: { overallScore: 96 } },
    { retro: true }, // real exports contain records without a date
  ]),
);
assert.deepEqual(sleep.days, [{ date: "2026-03-01", sleep_seconds: 27360, sleep_score: 96 }]);

const hrv = parseExportFile("hrv", JSON.stringify([{ calendarDate: "2026-03-01", metrics: [{ type: "HR", value: 47 }, { type: "HRV", value: 93 }] }]));
assert.deepEqual(hrv.days, [{ date: "2026-03-01", hrv_ms: 93 }]);

const daily = parseExportFile(
  "daily",
  JSON.stringify([
    {
      calendarDate: "2026-03-01",
      restingHeartRate: 42,
      allDayStress: { aggregatorList: [{ type: "ASLEEP", averageStressLevel: 12 }, { type: "TOTAL", averageStressLevel: 25 }] },
      bodyBattery: { bodyBatteryStatList: [{ bodyBatteryStatType: "HIGHEST", statsValue: 92 }, { bodyBatteryStatType: "LOWEST", statsValue: 43 }] },
    },
    { calendarDate: "2026-03-02", restingHeartRate: 0, allDayStress: { aggregatorList: [{ type: "TOTAL", averageStressLevel: -1 }] } },
  ]),
);
assert.deepEqual(daily.days, [{ date: "2026-03-01", resting_hr: 42, stress_avg: 25, body_battery_high: 92, body_battery_low: 43 }]);

const acts = parseExportFile(
  "activities",
  JSON.stringify([
    {
      summarizedActivitiesExport: [
        { activityId: 24945752060, activityType: "walking", startTimeGmt: 1793664330000, duration: 80817.0013, distance: 1557.99999, avgHr: 62, maxHr: 67, startLatitude: 36.6, name: "Taney County Walking" },
        { activityId: 1, activityType: "yoga", startTimeGmt: 1793663503000, duration: 300799.98, distance: null, avgHr: 64, maxHr: 71 },
      ],
    },
  ]),
);
assert.deepEqual(acts.activities[0], {
  id: "24945752060",
  sport: "walking",
  start_time: "2026-11-03T00:05:30.000Z",
  duration_s: 81,
  distance_m: 15.58,
  avg_hr: 62,
  max_hr: 67,
});
assert.equal(acts.activities[1].distance_m, null);
assert.equal(JSON.stringify(acts).includes("36.6"), false); // no location ever leaves the parser
assert.equal(JSON.stringify(acts).includes("Taney"), false);

const vo2 = parseExportFile("vo2max", JSON.stringify([{ calendarDate: "2026-03-01", vo2MaxValue: 52 }, { calendarDate: "2026-03-01", vo2MaxValue: 55 }]));
assert.deepEqual(vo2.days, [{ date: "2026-03-01", vo2_max: 55 }]);

const ready = parseExportFile(
  "readiness",
  JSON.stringify([
    { calendarDate: "2026-03-01", timestamp: "2026-03-01T14:00:00.0", score: 70 },
    { calendarDate: "2026-03-01", timestamp: "2026-03-01T06:10:00.0", score: 88 },
  ]),
);
assert.deepEqual(ready.days, [{ date: "2026-03-01", training_readiness: 88 }]);

assert.deepEqual(parseExportFile("sleep", "{not json"), { days: [], activities: [] });
console.log("export-parse: all tests passed");
