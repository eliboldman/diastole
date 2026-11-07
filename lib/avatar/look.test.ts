import assert from "node:assert/strict";

import { DEFAULT_LOOK, normalizeLook, randomLook } from "./look.ts";

// Older looks (just the sliders) keep them and get the neutral defaults: mint skin, no hair.
const old = normalizeLook({ build: 1.1, height: 0.95 });
assert.equal(old.build, 1.1);
assert.equal(old.height, 0.95);
assert.equal(old.skin, "mint");
assert.equal(old.hair, "none");

// Only known ids and clamped numbers survive.
const junk = normalizeLook({ skin: "<script>", hair: "dreads?", eyeSize: 99, build: -4, extra: "x".repeat(10_000) });
assert.equal(junk.skin, DEFAULT_LOOK.skin);
assert.equal(junk.hair, DEFAULT_LOOK.hair);
assert.equal(junk.eyeSize, 1.3);
assert.equal(junk.build, 0.85);
assert.ok(!("extra" in junk));

// Random looks are valid and stay well inside the database's 8 KB limit.
for (let i = 0; i < 200; i++) {
  const l = randomLook();
  assert.deepEqual(normalizeLook(l), l);
  assert.ok(JSON.stringify(l).length < 1500);
}
console.log("avatar look: all passed");
