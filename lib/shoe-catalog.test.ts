import assert from "node:assert/strict";

import { catalogLabel, SHOE_CATALOG, searchShoes } from "./shoe-catalog.ts";

const keys = SHOE_CATALOG.map((s) => `${s.brand} ${s.model}`);
assert.equal(new Set(keys).size, keys.length, "no duplicate models");
for (const b of ["Nike", "On", "Saucony", "Craft", "Hoka", "Brooks", "Altra"]) assert.ok(SHOE_CATALOG.some((s) => s.brand === b), b);
assert.ok(SHOE_CATALOG.some((s) => s.kind === "track") && SHOE_CATALOG.some((s) => s.kind === "speed"));

assert.equal(searchShoes("peg")[0].model, "Pegasus");
assert.equal(searchShoes("pegasus 41")[0].model, "Pegasus", "version numbers don't block a match");
assert.equal(catalogLabel(searchShoes("pegasus 41")[0], "pegasus 41"), "Nike Pegasus 41");
assert.equal(searchShoes("hoka mach")[0].model, "Mach");
assert.ok(searchShoes("endorphin").every((s) => s.brand === "Saucony"));
assert.equal(searchShoes("streakfly")[0].kind, "track");
assert.equal(searchShoes("speedgoat")[0].kind, "trail");
assert.deepEqual(searchShoes("41"), [], "a bare number matches nothing");
assert.deepEqual(searchShoes("zzz"), []);
console.log("shoe catalog ok", SHOE_CATALOG.length, "models");
