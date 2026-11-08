import assert from "node:assert/strict";

import { formatPaceTyping, parsePace, wholeNumber } from "./pace-input.ts";

for (const s of ["6:35", "635", "6.35", "6,35", "6 35", " 6:35 ", "6'35\"", "6:35 /mi", "6:35 min"]) assert.equal(parsePace(s), 395, s);
assert.equal(parsePace("1035"), 635);
assert.equal(parsePace("4:05"), 245);
assert.equal(parsePace("6:75"), null, "seconds over 59");
assert.equal(parsePace("6:5"), null, "one-digit seconds is ambiguous");
assert.equal(parsePace("abc"), null);
assert.equal(parsePace("65"), null, "two digits isn't a pace");

assert.equal(formatPaceTyping("6"), "6");
assert.equal(formatPaceTyping("63"), "63");
assert.equal(formatPaceTyping("635"), "6:35");
assert.equal(formatPaceTyping("6:35"), "6:35");
assert.equal(formatPaceTyping("1035"), "10:35");
assert.equal(formatPaceTyping("10355"), "10:35", "max four digits");

assert.equal(wholeNumber("250"), 250);
assert.equal(wholeNumber("250w"), 250);
assert.equal(wholeNumber("172 bpm"), 172);
assert.equal(wholeNumber("17.5"), null);
console.log("pace input: all passed");
