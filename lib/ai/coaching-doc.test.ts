// Run with: node lib/ai/coaching-doc.test.ts
import assert from "node:assert/strict";

import { splitCoachingDoc } from "./coaching-doc.ts";

const doc = `# Coaching System
Athlete data is isolated.

## 1. Philosophy
- Easy days stay easy.

## 3. Athlete Profiles

### Athlete 1 — Ann Example
- FTP: 250 W
- Goal: 70.3

### Athlete 2 — Ben Sample
- FTP: 200 W

---

## 4. Weekly Skeleton
| Day | Focus |
|-----|-------|
| Mon | Swim, Ben dryland |

## 5. History
**Ben (working FTP 200 W)**
- Tue: 3 x 12 min @ 160 W
- Sat: long ride

Long rides: Ann 215 W, Ben 160 W.
Ann completed a test.
- Protect easy days.
`;
const roster = [
  { id: "a", full_name: "Ann Example" },
  { id: "b", full_name: "Ben Sample" },
  { id: "c", full_name: "Cara Nobody" },
];
const s = splitCoachingDoc(doc, roster);
const ann = s.athletes.find((x) => x.id === "a")!.notes;
const ben = s.athletes.find((x) => x.id === "b")!.notes;

assert.ok(ann.includes("FTP: 250 W") && ann.includes("Ann completed a test."));
assert.ok(!ann.includes("200 W"), "Ann never gets Ben's numbers");
assert.ok(ben.includes("FTP: 200 W") && ben.includes("3 x 12 min @ 160 W") && ben.includes("long ride"));
assert.ok(!ben.includes("250"), "Ben never gets Ann's numbers");
assert.ok(s.guide.includes("Easy days stay easy.") && s.guide.includes("| Mon | Swim, Ben dryland |"));
assert.ok(!s.guide.includes("250 W") && !s.guide.includes("160 W"), "no athlete numbers in the shared guide");
assert.ok(s.guide.includes("Protect easy days."), "the bold block ends at a blank line");
assert.deepEqual(s.review, ["Long rides: Ann 215 W, Ben 160 W."]);
assert.equal(s.athletes.some((x) => x.id === "c"), false);
console.log("coaching doc: all passed");
