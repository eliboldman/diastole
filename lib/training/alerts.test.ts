import assert from "node:assert/strict";
import { isKeySession, sessionAlert } from "./alerts.ts";

const easy = [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 2700 } }] as never;
const reps = [{ kind: "repeat", times: 5, steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 180 } }] }] as never;
const long = [{ kind: "step", intensity: "ACTIVE", duration: { type: "time", seconds: 6000 } }] as never;
assert.equal(isKeySession("Easy run", easy, "run"), false);
assert.equal(isKeySession("Tempo Tuesday", easy, "run"), true);
assert.equal(isKeySession("2 x (5 x 400)", easy, "run"), true);
assert.equal(isKeySession("Monday", reps, "run"), true);
assert.equal(isKeySession("Sunday", long, "run"), true);
assert.equal(isKeySession("Z2 Filler Miles", easy, "run"), false);

const plan = { id: "p", date: "2026-11-09", sport: "run", title: "x", steps: easy, pool: null };
const s = (o: object) => ({ plan, activity: null, plannedSec: 2700, plannedM: 0, ratio: null, status: "done", ...o }) as never;
assert.deepEqual(sessionAlert(s({ status: "missed" }), null), { kind: "missed", text: "Missed" });
assert.match(sessionAlert(s({ status: "short", ratio: 0.55 }), null)!.text, /55%/);
assert.equal(sessionAlert(s({}), { steps: 6, judged: 5, on: 1, over: 0, under: 4 })!.kind, "off");
assert.equal(sessionAlert(s({}), { steps: 6, judged: 5, on: 3, over: 0, under: 2 }), null);
assert.equal(sessionAlert(s({}), { steps: 2, judged: 2, on: 0, over: 0, under: 2 }), null); // too few to judge
console.log("session alerts: all passed");
