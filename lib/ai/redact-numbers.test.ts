import assert from "node:assert/strict";

import { redactAthleteNumbers as r } from "./redact-numbers.ts";

assert.equal(r("**Walker (FTP 250)** likes long rides"), "**Walker (FTP [from the app])** likes long rides");
assert.equal(r("FTP: 280w, LTHR 172 bpm"), "FTP [from the app], LTHR [from the app]");
assert.match(r("threshold pace 6:35/mi"), /^threshold pace \[from the app\]$/);
assert.match(r("max HR 190 and resting HR 48"), /max HR \[from the app\] and resting HR \[from the app\]/);
assert.match(r("Z2 140-150, Zone 4: 165–172 bpm"), /^Z2 \[from the app\], Zone 4 \[from the app\]$/);
assert.match(r("easy runs at 8:30-9:00 min/mi"), /easy runs at pace \[from the app\]/);
assert.match(r("sweet spot 220-240 W"), /sweet spot watts \[from the app\]/);
// Structure stays.
const keep = "6 x 800m at 5K effort, 3x10 min at 88-94% FTP, 2:00 recovery, long run 90 min, 4 x 4 min";
assert.equal(r(keep), keep);
assert.equal(r("Week 3: 12 hours, 5 sessions"), "Week 3: 12 hours, 5 sessions");
console.log("redact numbers: all passed");

import { guideForAi, withoutWeeklySchedule } from "./redact-numbers.ts";
const doc = `## Philosophy
Polarized: 80% easy.
## Week
| Day | Session |
|---|---|
| Mon | Rest |
Monday: rest
- Tue - intervals 6 x 3 min
**Saturday** (long ride)
Mondays are for mobility in general.
Key sessions: one threshold, one VO2.`;
const out = withoutWeeklySchedule(doc);
assert.ok(!out.includes("|"), "tables gone");
assert.ok(!/Monday: rest|Tue - intervals|\*\*Saturday\*\*/.test(out), "day-by-day lines gone");
assert.ok(out.includes("Polarized: 80% easy.") && out.includes("Key sessions: one threshold, one VO2."), "principles stay");
assert.ok(out.includes("Mondays are for mobility in general."), "a sentence that just mentions a day stays");
assert.match(guideForAi("FTP 250. Monday: rest. Intervals 5 x 4 min."), /^FTP \[from the app\]\. Monday: rest\. Intervals 5 x 4 min\.$/, "inline day mentions inside a sentence aren't schedule lines");
console.log("weekly schedule: all passed");
