import assert from "node:assert/strict";

import { MOVES, matchSlug, moveBySlug, routineSeconds, SCREEN_CLIPS } from "../recovery/catalog.ts";
import { cleanAnswers, dailyFlow, overall, priorities, score, TESTS, tighter, type Answers } from "./screen.ts";

// Catalog wiring
assert.equal(new Set(MOVES.map((m) => m.slug)).size, MOVES.length, "unique move slugs");
for (const m of MOVES) if (m.easier) assert.ok(moveBySlug(m.easier), `${m.slug} easier → ${m.easier}`);
for (const t of TESTS) assert.ok(SCREEN_CLIPS.some((c) => c.slug === t.clip), `clip for ${t.id}`);
assert.equal(matchSlug("Screen - Ankle.MOV"), "screen-ankle");
assert.equal(matchSlug("couch stretch.mov"), "stretch-couch");
assert.equal(matchSlug("thread the needle.mp4"), "mobility-thread-needle");

// Everything good on both sides
const allGood: Answers = Object.fromEntries(
  TESTS.map((t) => {
    const v = "choices" in t.measure ? 2 : t.measure.good + 1;
    return [t.id, t.sided ? { left: v, right: v } : { both: v }];
  }),
);
const good = score(allGood);
assert.equal(overall(good), 100);
assert.deepEqual(priorities(good), []);
const easyDay = dailyFlow([], "rest");
assert.ok(easyDay.length >= 3, "general moves when nothing needs work");

// A runner: limited left ankle (6 cm vs 13 cm), fair hamstrings both sides, uneven hip rotation.
const runner: Answers = { ...allGood, ankle: { left: 6, right: 13 }, hamstring: { left: 1, right: 1 }, "hip-rotation": { left: 2, right: 1 } };
const r = score(runner);
const ankle = r.find((x) => x.id === "ankle")!;
assert.equal(ankle.worst, 0);
assert.equal(ankle.uneven, true);
assert.equal(tighter(ankle), "left");
assert.equal(tighter(r.find((x) => x.id === "hip-rotation")!), "right");
assert.equal(r.find((x) => x.id === "hamstring")!.uneven, false);
assert.ok(overall(r) < 100 && overall(r) > 50);

const p = priorities(r, { run: 5, bike: 3, swim: 2 });
assert.equal(p[0].id, "ankle", "limited first");
assert.match(p[0].reason, /left side is tighter than your right/);
assert.match(p[0].reason, /stride/);
assert.equal(p[1].id, "hip-rotation", "uneven before evenly fair");
assert.equal(p.length, 3);

// Small differences on a measured test aren't "uneven"
assert.equal(score({ ...allGood, ankle: { left: 12, right: 13 } }).find((x) => x.id === "ankle")!.uneven, false);

// Before training: dynamic and balance moves only, short, gentler ankle move because it's limited
const before = dailyFlow(p, "before");
for (const i of before) assert.ok(!/^(stretch|foam-roll|ball)-/.test(i.slug), `before: no long holds or rolling (${i.slug})`);
assert.equal(before[0].slug, "mobility-knee-to-wall", "limited ankle leads with the ankle drill");
assert.ok(routineSeconds(before) <= 9 * 60, `before is short: ${routineSeconds(before)}`);

// After and rest days are longer and can include holds; no repeats
const rest = dailyFlow(p, "rest");
assert.equal(new Set(rest.map((i) => i.slug)).size, rest.length, "no repeats");
assert.ok(routineSeconds(rest) > routineSeconds(before));
assert.ok(rest.some((i) => i.slug === "breath-box"));
assert.ok(rest.some((i) => i.slug === "stretch-supported-squat") && !rest.some((i) => i.slug === "stretch-deep-squat"), "limited: gentler held squat");
const after = dailyFlow(p, "after");
assert.ok(after.some((i) => /^(stretch|foam-roll|ball)-/.test(i.slug)), "after includes holds or rolling");

// Swimmer: shoulder limited → shoulder moves, reason about streamline
const swimmer = score({ ...allGood, shoulder: { left: 0, right: 0 } });
const sp = priorities(swimmer, { swim: 6, bike: 2, run: 2 });
assert.equal(sp[0].id, "shoulder");
assert.match(sp[0].reason, /streamline/);
assert.ok(dailyFlow(sp, "rest").some((i) => ["mobility-wall-slides", "mobility-strap-pass", "stretch-wall-lat"].includes(i.slug)));

// Answers: cleaned and complete only
assert.equal(cleanAnswers({ ankle: { left: 5 } }), null, "incomplete");
const cleaned = cleanAnswers({ ...allGood, ankle: { left: 99, right: -3 }, squat: { both: 1.7 } })!;
assert.deepEqual(cleaned.ankle, { left: 25, right: 0 });
assert.deepEqual(cleaned.squat, { both: 2 });

console.log("mobility screen: all passed");
