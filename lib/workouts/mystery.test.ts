import assert from "node:assert/strict";

import { sealed, sealedTitle, titleFor } from "./mystery.ts";

const w = { mystery: true, revealed_at: null, title: "5x5 at threshold", sport: "run" };
assert.equal(sealed(w), true);
assert.equal(sealed(w, true), false, "done unseals it");
assert.equal(sealed({ ...w, revealed_at: "2026-11-11T10:00:00Z" }), false, "revealed early");
assert.equal(sealed({ ...w, mystery: false }), false);
assert.equal(sealedTitle(w), "Mystery run");
assert.equal(sealedTitle({ ...w, sport: "bike" }), "Mystery ride");
assert.equal(titleFor(w), "Mystery run");
assert.equal(titleFor({ ...w, mystery: false }), "5x5 at threshold");
console.log("mystery: all passed");
