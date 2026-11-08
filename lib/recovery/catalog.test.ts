import assert from "node:assert/strict";

import { cleanItems, matchSlug, MOVES, routineSeconds, STARTERS, suggestRoutine } from "./catalog.ts";

assert.equal(new Set(MOVES.map((m) => m.slug)).size, MOVES.length, "unique slugs");
for (const r of STARTERS) for (const i of r.items) assert.ok(MOVES.some((m) => m.slug === i.slug), `${r.id}: ${i.slug}`);

assert.equal(matchSlug("foam-roll-hamstrings.mov"), "foam-roll-hamstrings");
assert.equal(matchSlug("Foam Roll - Hamstrings (L).MOV"), "foam-roll-hamstrings");
assert.equal(matchSlug("pigeon stretch.mp4"), "stretch-pigeon");
assert.equal(matchSlug("wall calf bent knee.mov"), "stretch-wall-calf-bent");
assert.equal(matchSlug("box-breathing.mov"), "breath-box");
assert.equal(matchSlug("vacation.mov"), null);

assert.deepEqual(cleanItems([{ slug: "foam-roll-calves", seconds: 5 }, { slug: "nope" }, { slug: "breath-box" }]), [{ slug: "foam-roll-calves", seconds: 10 }, { slug: "breath-box", seconds: 240 }]);
assert.equal(routineSeconds([{ slug: "foam-roll-calves", seconds: 45 }, { slug: "breath-box", seconds: 60 }]), 45 * 2 + 5 + 60);

assert.equal(suggestRoutine({ spots: ["calf_l", "calf_r", "knee_l"], readiness: "green" })?.routine.id, "starter-calf");
assert.match(suggestRoutine({ spots: ["calf_l"], readiness: null })!.why, /calf \(left\)/);
assert.equal(suggestRoutine({ spots: [], readiness: "red" })?.routine.id, "starter-breathe");
assert.equal(suggestRoutine({ spots: ["chest"], readiness: "green" }), null);
console.log("recovery catalog: all passed");
