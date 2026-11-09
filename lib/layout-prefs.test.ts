import assert from "node:assert/strict";

import { resolveLayout, visibleSections } from "./layout-prefs.ts";

const def = resolveLayout("me", null);
assert.equal(def.order[0], "setup", "My setup comes first");
assert.equal(def.order[1], "readiness");
assert.deepEqual(def.hidden, []);
assert.equal(visibleSections(def).length, def.order.length);

const custom = resolveLayout("me", { me: { order: ["prs", "readiness", "bogus", "prs"], hidden: ["form", "nope"] } });
assert.equal(custom.order[0], "setup", "a new first section lands at the top");
assert.equal(custom.order[1], "prs", "keeps the person's order");
assert.equal(custom.order[2], "story", "a missing section lands after its default neighbour (prs)");
assert.equal(custom.order[3], "secrets", "and the one after it follows");
assert.equal(custom.order[4], "readiness");
assert.ok(!custom.order.includes("bogus"), "drops unknown keys");
assert.equal(new Set(custom.order).size, custom.order.length, "no duplicates");
assert.equal(custom.order.length, def.order.length, "missing sections come back");
assert.equal(custom.order[5], "trends");
assert.deepEqual(custom.hidden, ["form"]);
assert.ok(!visibleSections(custom).includes("form"));

assert.deepEqual(resolveLayout("today", { today: "garbage" }).order, resolveLayout("today", {}).order);

// Today: the workout comes first; tallies and history start hidden until someone saves a layout.
const today = resolveLayout("today", null);
assert.equal(today.order[1], "upcoming");
assert.deepEqual(today.hidden, ["progress", "streaks", "recent", "pods"]);
assert.deepEqual(resolveLayout("today", { today: { order: today.order, hidden: [] } }).hidden, [], "a saved layout keeps its own choices");
console.log("layout prefs: all passed");
