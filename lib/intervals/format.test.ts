import assert from "node:assert/strict";

import type { Step } from "../workouts/garmin-format.ts";
import { cue, duration, plannedSeconds, toIntervalsText } from "./format.ts";

const steps: Step[] = [
  { kind: "step", intensity: "WARMUP", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low: 145, high: 174 } },
  {
    kind: "repeat",
    times: 4,
    steps: [
      { kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 240 }, target: { type: "power_range", low: 276, high: 290 }, note: "Stay seated, 90+ rpm" },
      { kind: "step", intensity: "RECOVERY", duration: { type: "time", seconds: 90 }, target: { type: "hr_zone", zone: 2 } },
    ],
  },
  { kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 5000 }, target: { type: "hr_range", low: 140, high: 152 } },
  { kind: "step", intensity: "ACTIVE", duration: { type: "distance", meters: 400 } },
  { kind: "step", intensity: "COOLDOWN", duration: { type: "open" } },
];

// With FTP: power as % so Zwift/Rouvy scale it to the rider; HR steps become the matching power zone
// (Zwift/Rouvy can't drive a trainer from HR). 140-152 of 190 = 74-80% max HR → zone 3.
assert.equal(
  toIntervalsText(steps, { ftp: 290, maxHr: 190 }),
  ["- 10m 50-60%", "", "4x", "- Stay seated, rpm 4m 95-100%", "- 1m30s 60-72%", "", "- 5km 76-88%", "- 400mtr freeride", "- Open step 5m freeride"].join("\n"),
);

// Without FTP, HR targets stay HR.
assert.equal(toIntervalsText(steps.slice(1, 3), { maxHr: 190 }).split("\n").slice(-3).join("\n"), ["- 1m30s Z2 HR", "", "- 5km 74-80% HR"].join("\n"));

// Without FTP: absolute watts; without max HR an HR range rides free.
assert.equal(
  toIntervalsText(steps.slice(0, 1).concat(steps.slice(2, 3))),
  ["- 10m 145-174w", "- 5km freeride"].join("\n"),
);

// Nested repeats are expanded inside the outer block (the text format can't nest).
const nested: Step[] = [{ kind: "repeat", times: 2, steps: [{ kind: "repeat", times: 2, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 30 }, target: { type: "power_range", low: 400, high: 400 } }] }, { kind: "step", intensity: "REST", duration: { type: "time", seconds: 60 } }] }];
assert.equal(toIntervalsText(nested), ["2x", "- 30s 400w", "- 30s 400w", "- 1m freeride"].join("\n"));

assert.equal(duration(3725), "1h2m5s");
assert.equal(duration(90), "1m30s");
assert.equal(cue("Hold 5x30\" @ 120% -- go!"), "Hold x @ go");
assert.equal(plannedSeconds(steps), 600 + 4 * 330 + 300);
assert.equal(toIntervalsText([]), "");

console.log("intervals format: all passed");
