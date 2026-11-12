import assert from "node:assert/strict";

import { shapeMember, type MemberFacts } from "./shape.ts";

const base: MemberFacts = { first: "Ana", shareLevel: 0, sessions: [{ sport: "run", minutes: 60, name: "Hill Hell" }, { sport: "swim", minutes: 30, name: "Morning Swim" }], prs: ["Fastest 5K"], returnedAfterDays: 9, campfireHighlight: null, batonPasses: 0, propsReceived: 0, topSticker: null, challengeJoined: [] };

// Name only and nothing social: left out entirely.
assert.equal(shapeMember(base), null);
// Readiness-level sharing still doesn't open training.
assert.equal(shapeMember({ ...base, shareLevel: 1 }), null);
// Training sharing: sessions, hours, PRs, the comeback, playful names only.
const t = shapeMember({ ...base, shareLevel: 2 })!;
assert.equal(t.training?.sessions, 2);
assert.equal(t.training?.hours, 1.5);
assert.deepEqual(t.training?.fun_workout_names, ["Hill Hell"]);
assert.deepEqual(t.training?.prs, ["Fastest 5K"]);
assert.equal(t.training?.back_after_quiet_days, 9);
// Things they put in front of the pod themselves count at any level.
const s = shapeMember({ ...base, campfireHighlight: "Finally liked a swim", batonPasses: 2, propsReceived: 40, topSticker: "Snail mode" })!;
assert.equal(s.training, undefined);
assert.equal(s.campfire_highlight, "Finally liked a swim");
assert.equal(s.baton_passes, 2);
// No health fields exist on the shape at all.
assert.equal(JSON.stringify(t).match(/hrv|sleep|stress|readiness|weight|pain/i), null);
console.log("stories: all passed");
