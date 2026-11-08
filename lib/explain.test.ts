import assert from "node:assert/strict";

import { explain } from "./explain.ts";

assert.match(explain("hrv", { value: 62, baseline: 55 }), /13% above your normal of 55, a good sign/);
assert.match(explain("resting_hr", { value: 58, baseline: 50 }), /16% above.*go a little easier/);
assert.match(explain("hrv", { value: 56, baseline: 55 }), /right around your normal/);
assert.match(explain("avg_hr", { value: 140, maxHr: 190 }), /74% of your max, an easy aerobic effort/);
assert.match(explain("normalized_power", { value: 220, ftp: 250 }), /88% of your FTP/);
assert.ok(!/undefined|NaN/.test(explain("vertical_oscillation")), "works without numbers");
console.log("explain: all passed");
