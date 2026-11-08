import assert from "node:assert/strict";

import { BIKE_CATALOG, searchBikes } from "./bike-catalog.ts";
import { catalogLabel } from "./catalog-search.ts";

const keys = BIKE_CATALOG.map((s) => `${s.brand} ${s.model}`);
assert.equal(new Set(keys).size, keys.length, "no duplicate models");
for (const b of ["Giant", "Trek", "Specialized", "Cervélo", "KÚ Cycle", "Ventum", "Canyon", "Bianchi"]) assert.ok(BIKE_CATALOG.some((s) => s.brand === b), b);

assert.equal(searchBikes("cervelo p5")[0].model, "P5", "accents don't matter");
assert.equal(searchBikes("p5")[0].kind, "tt");
assert.equal(searchBikes("ku tf1")[0].brand, "KÚ Cycle");
assert.equal(searchBikes("speed concept")[0].brand, "Trek");
assert.equal(searchBikes("speedmax")[0].brand, "Canyon");
assert.equal(searchBikes("tarmac")[0].kind, "road");
assert.equal(searchBikes("ventum one")[0].kind, "tt");
assert.equal(searchBikes("grail")[0].kind, "gravel");
assert.equal(catalogLabel(searchBikes("emonda")[0], "emonda"), "Trek Émonda");
assert.deepEqual(searchBikes("zzz"), []);
console.log("bike catalog ok", BIKE_CATALOG.length, "models");
