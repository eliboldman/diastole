import assert from "node:assert/strict";

import { cleanCloset } from "./closet.ts";
import { raceDayPack } from "./race-pack.ts";

const closet = cleanCloset({
  shoes: [
    { id: "d", model: "Ghost 17", kind: "daily" },
    { id: "r", model: "Alphafly 3", kind: "race" },
  ],
  bikes: [
    { id: "b", model: "Tarmac", kind: "road" },
    { id: "t", model: "Cervelo P3", kind: "tt" },
  ],
});
const items = (sport: string, w: Parameters<typeof raceDayPack>[3] = null) => raceDayPack(sport, closet, {}, w, "mi").map((i) => i.item);

const run = items("run");
assert.ok(run[0].startsWith("Race bib"));
assert.ok(run.includes("Alphafly 3"), "the race shoes");
assert.ok(!run.includes("Cervelo P3"));
const tri = items("tri");
assert.ok(tri.includes("Alphafly 3") && tri.some((i) => i.startsWith("Wetsuit")), "a tri bag has every leg");
assert.ok(tri.includes("Cervelo P3") && !tri.includes("Tarmac"), "the TT bike for a triathlon");
assert.ok(raceDayPack("bike", closet, {}, null, "mi", "Hill Country Time Trial").some((i) => i.item === "Cervelo P3"));
assert.equal(new Set(tri).size, tri.length, "nothing listed twice");
const hot = items("run", { date: "2026-11-08", high: 32, low: 22, rainChance: 0, feelsMorning: 30, coldMorning: 23, wind: 5, code: 0 });
assert.ok(hot.includes("Extra fluids and electrolytes"), "weather joins the bag");
console.log("race pack: all passed");
