import assert from "node:assert/strict";
import { applyTo, startMonday, toTemplate, updatesFor } from "./template.ts";

const pw = (date: string, sport: string, title: string, low = 200) => ({
  scheduled_date: date, title, sport, description: null,
  steps: [{ kind: "step", intensity: "INTERVAL", duration: { type: "time", seconds: 600 }, target: { type: "power_range", low, high: low + 20, rel: { pct: [80, 88] } } }] as never,
  pool: null,
});

// Two weeks from Mon Nov 2: Tue bike, Sat long run, next Tue bike.
const t = toTemplate([pw("2026-11-03", "bike", "Tempo"), pw("2026-11-07", "run", "Long"), pw("2026-11-10", "bike", "Tempo 2")], "2026-11-04");
assert.equal(t.weeks, 2);
assert.deepEqual(t.workouts.map((w) => [w.week, w.day, w.title]), [[1, 1, "Tempo"], [1, 5, "Long"], [2, 1, "Tempo 2"]]);

// Race on Sun Dec 20 in a 2-week plan with race week: start Mon Dec 7.
assert.equal(startMonday({ weeks: 2, raceWeek: true, raceDate: "2026-12-20" }), "2026-12-07");
assert.equal(startMonday({ weeks: 2, raceWeek: false, raceDate: "2026-12-20" }), "2026-11-30"); // plan ends the week before race week
assert.equal(startMonday({ weeks: 4, raceWeek: true, startDate: "2026-11-12" }), "2026-11-09");

// Apply: athlete FTP 300 → 240–264 W; Tuesday is a rest day for them → bike moves to Wednesday.
const ws = t.workouts.map((w, i) => ({ ...w, id: `tw${i}` }));
const items = applyTo({ workouts: ws, start: "2026-11-09", zones: { ftp_w: 300 }, week: { tue: { sports: ["rest"] } }, today: "2026-11-10" });
assert.deepEqual(items.map((i) => [i.tw.title, i.date, i.movedFrom]), [["Tempo", "2026-11-11", "2026-11-10"], ["Long", "2026-11-14", null], ["Tempo 2", "2026-11-18", "2026-11-17"]]);
assert.equal((items[0].steps[0] as { target: { low: number } }).target.low, 240);
assert.deepEqual(items[0].missing, []);
// No FTP: kept as written and reported.
assert.deepEqual(applyTo({ workouts: ws, start: "2026-11-09", zones: null, today: "2026-11-01" })[0].missing, ["FTP"]);
// Past dates are marked.
assert.equal(applyTo({ workouts: ws, start: "2026-11-02", zones: null, today: "2026-11-10" })[0].past, true);

// Updates: Tempo 2 got a new title, Long was removed from the template, a new swim was added.
const rows = items.map((i, k) => ({ id: `p${k}`, template_workout_id: i.tw.id!, scheduled_date: i.date, title: i.tw.title, description: null, steps: i.steps, brick: null, status: "sent", done: false }));
const newWs = [ws[0], { ...ws[2], title: "Tempo 2 (longer)" }, { ...ws[0], id: "tw9", sport: "swim", title: "Swim", week: 2, day: 3 }];
const newItems = applyTo({ workouts: newWs as never, start: "2026-11-09", zones: { ftp_w: 300 }, week: { tue: { sports: ["rest"] } }, today: "2026-11-10" });
const ch = updatesFor({ rows, items: newItems, today: "2026-11-12" });
assert.deepEqual(ch.map((c) => c.kind + ":" + (c.kind === "remove" ? c.row.title : c.item.tw.title)).sort(), ["add:Swim", "remove:Long", "update:Tempo 2 (longer)"]);
// Done and past sessions are left alone.
assert.equal(updatesFor({ rows: rows.map((r) => ({ ...r, done: true })), items: newItems, today: "2026-11-12" }).filter((c) => c.kind !== "add").length, 0);
console.log("plan templates: all passed");
