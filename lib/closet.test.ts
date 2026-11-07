import assert from "node:assert/strict";

import { cleanCloset, closetForPrompt, EMPTY_CLOSET, isEmptyCloset, packFor } from "./closet.ts";

const c = cleanCloset({
  shoes: [
    { id: "a", model: "Nike Pegasus 41", kind: "daily" },
    { id: "b", model: "Vaporfly 3", kind: "race" },
    { id: "c", model: "Speedgoat 6", kind: "trail" },
    { id: "d", model: "", kind: "race" },
    { model: "Mystery", kind: "moon" },
  ],
  bikes: [
    { id: "r", model: "Specialized Tarmac", kind: "road" },
    { id: "t", model: "Cervelo P3", kind: "tt" },
  ],
  trainer: { kind: "smart", model: "Wahoo Kickr" },
  extras: { hr_strap: { model: "HRM-Pro" }, pool: {}, bogus: {} },
  notes: "x".repeat(900),
});

assert.equal(c.shoes.length, 4, "blank models dropped");
assert.equal(c.shoes[3].kind, "daily", "unknown kinds fall back");
assert.equal(c.notes.length, 500);
assert.ok(c.extras.pool && !("bogus" in c.extras));
assert.ok(isEmptyCloset(cleanCloset(null)));
assert.equal(closetForPrompt(EMPTY_CLOSET), null);
const lines = closetForPrompt(c)!;
assert.ok(lines.some((l) => l.includes("Cervelo P3 (TT / triathlon)")));
assert.ok(lines.some((l) => l.startsWith("Does not have:") && l.includes("wetsuit")));

const items = (w: Parameters<typeof packFor>[0], cl = c) => packFor(w, cl).map((p) => p.item);

assert.deepEqual(items({ sport: "running", title: "Easy 45" }).slice(0, 1), ["Nike Pegasus 41"]);
const tempo = items({ sport: "running", title: "Tempo 3x10 min" });
assert.equal(tempo[0], "Vaporfly 3", "race shoes for fast work");
assert.ok(tempo.includes("Nike Pegasus 41"), "plus trainers for warm-up");
assert.ok(tempo.includes("HRM-Pro"));
assert.equal(items({ sport: "trail_running", title: "Long trail run" })[0], "Speedgoat 6");
assert.ok(items({ sport: "running", title: "8x400 at the track" }).includes("Find a track"));

assert.equal(items({ sport: "cycling", title: "Race-pace TT intervals" })[0], "Cervelo P3");
assert.equal(items({ sport: "cycling", title: "Endurance ride" })[0], "Specialized Tarmac");
const indoor = items({ sport: "cycling", title: "Indoor sweet spot", description: "ERG mode" });
assert.equal(indoor[0], "Wahoo Kickr");
assert.ok(indoor.includes("Towel, fan and a big bottle"));

const noPm = cleanCloset({ bikes: [{ model: "Old road bike", kind: "road" }] });
assert.ok(items({ sport: "cycling", title: "FTP intervals", description: "4x8 at 105% FTP" }, noPm).includes("Ride by heart rate or feel"));

assert.ok(items({ sport: "lap_swimming", title: "Pull set", description: "pull buoy" }).some((i) => i.includes("Pull buoy")));
assert.ok(!items({ sport: "lap_swimming", title: "Easy swim" }).includes("Find a pool"), "has pool access");
assert.ok(items({ sport: "open_water_swimming", title: "Lake swim" }, EMPTY_CLOSET).some((i) => i.startsWith("Wetsuit")));
assert.deepEqual(items({ sport: "running", title: "Easy" }, EMPTY_CLOSET), ["Running shoes"]);
assert.equal(items({ sport: "bike", title: "Endurance" })[0], "Specialized Tarmac", "planned-workout sport names");
assert.equal(items({ sport: "run", title: "Tempo" })[0], "Vaporfly 3");
console.log("closet: all passed");
