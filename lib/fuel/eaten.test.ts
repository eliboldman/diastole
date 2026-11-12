import assert from "node:assert/strict";

import { localDateOf, resolveEatenAt, zonedToUtc } from "./eaten.ts";

const tz = "America/Chicago";
// CST (UTC-6) in November, CDT (UTC-5) in July.
assert.equal(new Date(zonedToUtc("2026-11-12", "07:30", tz)!).toISOString(), "2026-11-12T13:30:00.000Z");
assert.equal(new Date(zonedToUtc("2026-07-01", "07:30", tz)!).toISOString(), "2026-07-01T12:30:00.000Z");
assert.equal(new Date(zonedToUtc("2026-11-12", "23:15", tz)!).toISOString(), "2026-11-13T05:15:00.000Z");
assert.equal(localDateOf(zonedToUtc("2026-11-12", "23:15", tz)!, tz), "2026-11-12"); // still the 12th locally
assert.equal(zonedToUtc("2026-11-12", "25:00", tz), null);
assert.equal(zonedToUtc("nope", "07:00", tz), null);

const now = Date.parse("2026-11-12T18:00:00Z"); // noon in Chicago
assert.deepEqual(resolveEatenAt(null, tz, now), { ok: true, ms: now });
assert.deepEqual(resolveEatenAt({ ago: 30 }, tz, now), { ok: true, ms: now - 30 * 60_000 });
assert.deepEqual(resolveEatenAt({ date: "2026-11-12", time: "07:30" }, tz, now), { ok: true, ms: Date.parse("2026-11-12T13:30:00Z") });
assert.equal(resolveEatenAt({ date: "2026-11-12", time: "15:00" }, tz, now).ok, false); // future
assert.equal(resolveEatenAt({ date: "2026-11-08", time: "07:00" }, tz, now).ok, false); // too far back
assert.equal(resolveEatenAt({ ago: -5 }, tz, now).ok, false);
console.log("eaten: all passed");
