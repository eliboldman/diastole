import assert from "node:assert/strict";

import { autoDone, CATALOG, catalogQuest, isRestDay, questsFor, questTextProblem, type CustomQuest } from "./quests.ts";

// Rest day rules.
assert.equal(isRestDay({ plannedToday: 0, plannedNearby: 3, paused: false }), true);
assert.equal(isRestDay({ plannedToday: 1, plannedNearby: 3, paused: false }), false);
assert.equal(isRestDay({ plannedToday: 0, plannedNearby: 0, paused: false }), false, "no plan around it: not a rest day");
assert.equal(isRestDay({ plannedToday: 0, plannedNearby: 3, paused: true }), false, "sick/injured: no quests");

// Stable within a day, varies across days, 2 without coach quests.
const a = questsFor("ath-1", "2026-11-12", []);
assert.equal(a.length, 2);
assert.deepEqual(a, questsFor("ath-1", "2026-11-12", []));
assert.equal(new Set(a.map((q) => q.key)).size, 2, "no repeats");
const days = new Set(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"].map((d) => questsFor("ath-1", d, []).map((q) => q.key).join()));
assert.ok(days.size > 1, "changes day to day");

// A coach quest comes first; athlete-specific beats roster-wide; 3 total.
const custom: CustomQuest[] = [
  { id: "11111111-1111-1111-1111-111111111111", title: "Roster quest", blurb: null, grit: 10, athlete_id: null, created_at: "2026-11-01" },
];
const b = questsFor("ath-1", "2026-11-12", custom);
assert.equal(b.length, 3);
assert.equal(b[0].key, "c:11111111-1111-1111-1111-111111111111");
assert.equal(b[0].coach, true);

// Auto ticks.
assert.equal(autoDone(catalogQuest("walk_outside")!, { walkMinutes: 22, recoveryDone: false }), true);
assert.equal(autoDone(catalogQuest("walk_outside")!, { walkMinutes: 10, recoveryDone: false }), false);
assert.equal(autoDone(catalogQuest("mobility")!, { walkMinutes: 0, recoveryDone: true }), true);
assert.equal(autoDone(catalogQuest("legs_up")!, { walkMinutes: 99, recoveryDone: true }), false);

// Nothing in the catalog is about food amounts, calories or weight.
for (const q of CATALOG) assert.equal(questTextProblem(q.title, q.blurb), null, q.key);

// Coach text guard.
assert.ok(questTextProblem("Fasted walk", "Skip breakfast first"));
assert.ok(questTextProblem("Burn 300 calories", ""));
assert.ok(questTextProblem("Weigh in", ""));
assert.equal(questTextProblem("Stretch with your pod", "Ten minutes on a call"), null);
assert.equal(questTextProblem("Light weights", "Mobility with light weights"), null, "lifting weights is fine");
assert.ok(questTextProblem("", "x"));

console.log("quests: all passed");
