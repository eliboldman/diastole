import assert from "node:assert/strict";

import { allAwards, balanceOf, campAward, CHECKIN_GRIT, dayFlag, effortFactor, PLANNED_BONUS, SESSION_DAY_CAP, sessionAwards, smartRestAwards, type EarnInput } from "./earn.ts";
import { gearOf, ITEM, ITEMS, normalizeGear, STORE_THEMES } from "./catalog.ts";

const tz = "America/Chicago";
const base = (over: Partial<EarnInput> = {}): EarnInput => ({ tz, activities: [], checkins: [], readiness: {}, planned: [], pausedSince: null, backedOff: [], ...over });
const act = (id: string, day: string, mins: number, sport = "running", planned: string | null = null, load: number | null = null) => ({
  id,
  start_time: `${day}T14:00:00Z`,
  duration_s: mins * 60,
  sport,
  training_load: load,
  planned_workout_id: planned,
});

// Effort: RPE first, load per hour next, else neutral.
assert.equal(effortFactor(5, null, 60), 1);
assert.equal(effortFactor(10, null, 60), 1.4);
assert.equal(effortFactor(null, null, 60), 1);
assert.ok(effortFactor(null, 150, 60) > 1, "hard load per hour");
assert.equal(effortFactor(null, 10, 60), 0.7, "easy load floors at 0.7");

// Readiness for grit: the worse of overall and sleep.
assert.equal(dayFlag({ overall: "green", sleep: "red" }), "red");
assert.equal(dayFlag(undefined), "unknown");

// An unplanned hour, neutral effort: 10 grit, no readiness bonus even on a red day.
{
  const a = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60)], readiness: { "2026-11-10": { overall: "red", sleep: "red" } } }));
  assert.equal(a.length, 1);
  assert.equal(a[0].amount, 10, "readiness bonus only for planned sessions");
}

// A planned quality session on a red day earns more than on a green one.
{
  const plan = [{ id: "p1", date: "2026-11-10", sport: "run" }];
  const checkins = [{ activity_id: "a1", rpe: 7, pain: {}, created_at: "2026-11-10T16:00:00Z" }];
  const green = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60, "running", "p1")], planned: plan, checkins, readiness: { "2026-11-10": { overall: "green", sleep: "green" } } }))[0].amount;
  const red = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60, "running", "p1")], planned: plan, checkins, readiness: { "2026-11-10": { overall: "green", sleep: "red" } } }))[0].amount;
  assert.equal(green, Math.round(10 * 1.16) + PLANNED_BONUS);
  assert.ok(red > green, "poor sleep + planned quality session earns more");
  // ...but never when hurting or in sick mode.
  const hurt = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60, "running", "p1")], planned: plan, checkins: [{ ...checkins[0], pain: { knee_l: 2 } }], readiness: { "2026-11-10": { overall: "red", sleep: "red" } } }))[0].amount;
  assert.equal(hurt, green, "pain removes the low-readiness bonus");
  const sick = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60, "running", "p1")], planned: plan, checkins, pausedSince: "2026-11-09", readiness: { "2026-11-10": { overall: "red", sleep: "red" } } }))[0].amount;
  assert.equal(sick, green, "sick mode removes the low-readiness bonus");
}

// A plan matched by sport on the day counts as planned (even without the link).
{
  const a = sessionAwards(base({ activities: [act("a1", "2026-11-10", 60, "cycling")], planned: [{ id: "p1", date: "2026-11-10", sport: "bike" }] }));
  assert.equal(a[0].detail?.planned, true);
}

// Short sessions earn nothing; a day is capped.
{
  assert.equal(sessionAwards(base({ activities: [act("a1", "2026-11-10", 8)] })).length, 0);
  const day = sessionAwards(base({ activities: [act("a1", "2026-11-10", 240, "cycling"), { ...act("a2", "2026-11-10", 240), start_time: "2026-11-10T20:00:00Z" }], checkins: [{ activity_id: "a1", rpe: 10, pain: {}, created_at: "" }, { activity_id: "a2", rpe: 10, pain: {}, created_at: "" }] }));
  assert.equal(day.reduce((s, x) => s + x.amount, 0), SESSION_DAY_CAP);
}

// Check-ins: grit only for a real one.
{
  const a = allAwards(base({ checkins: [{ activity_id: "a1", rpe: 6, pain: {}, created_at: "" }, { activity_id: "a2", rpe: null, pain: {}, created_at: "" }] }));
  assert.deepEqual(a.map((x) => [x.kind, x.amount]), [["checkin", CHECKIN_GRIT]]);
}

// Smart calls: easing off on a low day, once a day; sick mode earns nothing.
{
  const r = { "2026-11-10": { overall: "yellow" as const, sleep: "green" as const }, "2026-11-11": { overall: "green" as const, sleep: "green" as const } };
  const a = smartRestAwards(base({ readiness: r, backedOff: [{ id: "c1", date: "2026-11-10" }, { id: "c2", date: "2026-11-10" }, { id: "c3", date: "2026-11-11" }], pausedSince: "2026-11-11" }));
  assert.equal(a.length, 1);
  assert.equal(a[0].ref, "day:2026-11-10");
}

// Camps: only after the camp, only when the goal was reached, only if they took part.
{
  const camp = { id: "c1", title: "Base camp", goal_value: 40, ends_on: "2026-11-10" };
  assert.equal(campAward(camp, 41, true, "2026-11-11")?.amount, 50);
  assert.equal(campAward(camp, 39, true, "2026-11-11"), null);
  assert.equal(campAward(camp, 41, false, "2026-11-11"), null);
  assert.equal(campAward(camp, 41, true, "2026-11-10"), null, "not until it's over");
}

assert.equal(balanceOf([{ amount: 30 }, { amount: -12 }]), 18);

// Catalog sanity.
assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length, "unique ids");
for (const i of ITEMS) {
  assert.match(i.id, /^[a-z]+:[a-z0-9_]{1,40}$/, i.id);
  assert.ok(i.price > 0 && Number.isInteger(i.price), i.id);
  if (i.category === "sticker") assert.ok(i.id.startsWith("sticker:g_"), "store stickers start with g_");
  if (i.category === "ability") assert.ok(i.max && i.max > 0);
}
assert.ok(ITEM["ability:shield"]);
assert.deepEqual(STORE_THEMES, ["lagoon", "ember", "aurora"]);
assert.deepEqual(normalizeGear({ jersey: "midnight", helmet: "nope", aura: 3 }), { jersey: "midnight" });
assert.deepEqual(gearOf({ build: 1, gear: { aura: "tide" } }), { aura: "tide" });

console.log("grit: all passed");
