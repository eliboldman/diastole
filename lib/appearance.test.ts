import assert from "node:assert/strict";

import { asLook, DEFAULT_LOOK, lookAttrs, lookCookie } from "./appearance.ts";

assert.deepEqual(asLook(undefined), DEFAULT_LOOK);
assert.deepEqual(asLook("not json"), DEFAULT_LOOK, "a broken cookie falls back");
assert.deepEqual(asLook({ bg: "neon", text: "huge", glow: "yes", hue: 400 }), { ...DEFAULT_LOOK, hue: 40 }, "unknown values fall back, hue wraps");
assert.equal(asLook({ hue: -30 }).hue, 330);
const mine = { ...DEFAULT_LOOK, bg: "black", text: "xl", corners: "square", density: "compact", glow: false, motion: false, hue: 20 } as const;
assert.deepEqual(asLook(lookCookie(mine)), mine, "cookie round-trips");
assert.deepEqual(lookAttrs(DEFAULT_LOOK), {}, "defaults add nothing to the page");
assert.deepEqual(lookAttrs(mine), { "data-bg": "black", "data-glow": "off", "data-text": "xl", "data-corners": "square", "data-density": "compact", "data-motion": "off" });
console.log("appearance: all passed");
