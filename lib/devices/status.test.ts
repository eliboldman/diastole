import assert from "node:assert/strict";
import { watchStatus } from "./status.ts";

const now = Date.parse("2026-11-10T18:00:00Z");
const today = "2026-11-10";
const fresh = { source: "garmin" as const, connected_at: "2026-10-01T00:00:00Z", last_synced_at: "2026-11-10T09:00:00Z" };

assert.equal(watchStatus({ device: null, workouts: [], today, now }).state, "none");
assert.deepEqual(watchStatus({ device: fresh, workouts: [], today, now }), { state: "ok", device: "garmin", lastSync: fresh.last_synced_at, issues: [] });

// Stale Garmin
const stale = watchStatus({ device: { ...fresh, last_synced_at: "2026-11-07T09:00:00Z" }, workouts: [], today, now });
assert.equal(stale.state, "attention");
assert.match(stale.issues[0].text, /No Garmin data in 3 days/);

// Garmin: approved without an id = failed send; past ones and drafts don't count
const w = (o: Partial<Record<string, string | null>>) => ({ scheduled_date: "2026-11-12", status: "approved", external_id: null, sent_at: null, deleted_at: null, removal_status: null, ...o });
const g = watchStatus({ device: fresh, workouts: [w({}), w({ status: "sent", external_id: "123" }), w({ scheduled_date: "2026-11-01" }), w({ deleted_at: "2026-11-09T00:00:00Z", removal_status: "failed" })], today, now });
assert.deepEqual(g.issues.map((i) => i.key), ["unsent", "removal"]);
assert.match(g.issues[0].text, /^1 workout approved/);

// Apple: sent but not confirmed after 12 h
const apple = { source: "apple" as const, connected_at: "2026-10-01T00:00:00Z", last_synced_at: "2026-11-10T12:00:00Z" };
const a = watchStatus({ device: apple, workouts: [w({ status: "sent", sent_at: "2026-11-09T20:00:00Z" }), w({ status: "sent", sent_at: "2026-11-10T15:00:00Z" }), w({ status: "sent", external_id: "apple:x", sent_at: "2026-11-08T00:00:00Z" })], today, now });
assert.deepEqual(a.issues.map((i) => i.key), ["waiting"]);
assert.match(a.issues[0].text, /^1 workout waiting/);

// intervals.icu error
assert.equal(watchStatus({ device: fresh, workouts: [], intervals: { last_error: "401 Unauthorized", dirty_at: null, pushed_at: null }, today, now }).issues[0].key, "intervals");
console.log("watch status: all passed");
