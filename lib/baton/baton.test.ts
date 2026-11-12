import assert from "node:assert/strict";

import { advance, milestonesCrossed, nextAfter, type BatonState } from "./baton.ts";

const empty: BatonState = { holder: null, since: null, handoffs: 0, chain: 0, longest: 0, nudged_at: null };
const order = ["ana", "ben", "cy"];
const t = (h: number) => new Date(Date.UTC(2026, 10, 10, 0, 0) + h * 3_600_000).toISOString();

assert.equal(nextAfter(order, "cy"), "ana");
assert.equal(nextAfter(["solo"], "solo"), null);

// Needs two people.
assert.equal(advance(empty, { order: ["ana"], finishes: {}, resting: new Set(), now: t(0) }).events.length, 0);

// Starts with the first member.
let r = advance(empty, { order, finishes: {}, resting: new Set(), now: t(0) });
assert.equal(r.state.holder, "ana");
assert.equal(r.events[0].kind, "start");

// Ana finishes at h3, Ben at h5 (after he got it), Cy hasn't: two handoffs, timed to the finishes.
r = advance(r.state, { order, finishes: { ana: [{ at: t(3), activity: "a1" }], ben: [{ at: t(2), activity: "b0" }, { at: t(5), activity: "b1" }] }, resting: new Set(), now: t(6) });
assert.deepEqual(r.events.map((e) => [e.kind, e.from, e.to, e.at]), [["pass", "ana", "ben", t(3)], ["pass", "ben", "cy", t(5)]]);
assert.equal(r.state.handoffs, 2);
assert.equal(r.state.chain, 2);
assert.equal(r.state.holder, "cy");
assert.equal(r.nudge, false);

// Cy is on a rest day: it moves on, chain untouched.
let rest = advance(r.state, { order, finishes: {}, resting: new Set(["cy"]), now: t(8) });
assert.equal(rest.state.holder, "ana");
assert.equal(rest.events[0].kind, "skip");
assert.equal(rest.state.chain, 2);

// Everyone resting: it waits.
rest = advance(r.state, { order, finishes: {}, resting: new Set(order), now: t(8) });
assert.equal(rest.state.holder, "cy");

// A day with Cy: one friendly nudge, not repeated.
const day = advance(r.state, { order, finishes: {}, resting: new Set(), now: t(30) });
assert.equal(day.nudge, true);
assert.equal(advance(day.state, { order, finishes: {}, resting: new Set(), now: t(31) }).nudge, false);

// Two days: it hops on, the chain starts fresh, the longest is kept.
const hop = advance(r.state, { order, finishes: {}, resting: new Set(), now: t(54) });
assert.equal(hop.events.at(-1)?.kind, "hop");
assert.equal(hop.state.chain, 0);
assert.equal(hop.state.longest, 2);

// Milestones pay once.
assert.deepEqual(milestonesCrossed({ ...empty, handoffs: 9, longest: 6 }, { ...empty, handoffs: 10, longest: 7 }), [{ kind: "handoffs", n: 10 }, { kind: "chain", n: 7 }]);
assert.deepEqual(milestonesCrossed({ ...empty, handoffs: 10, longest: 7 }, { ...empty, handoffs: 11, longest: 7 }), []);

// An opted-out holder: passes on, chain kept.
const out = advance({ ...r.state, holder: "zed", since: t(6) }, { order, finishes: {}, resting: new Set(), now: t(7) });
assert.ok(order.includes(out.state.holder!));
assert.equal(out.state.chain, 2);

console.log("baton: all passed");
