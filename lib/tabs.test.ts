import assert from "node:assert/strict";

import { cleanTabs, DEFAULT_TABS, tabsCookie, tabsFromCookie } from "./tabs.ts";

assert.deepEqual(cleanTabs(["me", "fuel", "recovery"], "athlete"), ["me", "fuel", "recovery"]);
assert.deepEqual(cleanTabs(["me", "fuel"], "athlete"), DEFAULT_TABS.athlete, "fewer than 3 → defaults");
assert.deepEqual(cleanTabs(["me", "pods", "fuel", "races", "calendar", "messages"], "athlete").length, 5, "at most 5");
assert.deepEqual(cleanTabs(["me", "me", "lab", "fuel", "pods"], "athlete"), ["me", "fuel", "pods"], "unknown and repeated ids dropped");
assert.deepEqual(tabsFromCookie(tabsCookie({ coach: ["today", "calendar", "messages"] }), "coach"), ["today", "calendar", "messages"]);
assert.deepEqual(tabsFromCookie(tabsCookie({ coach: ["today", "calendar", "messages"] }), "athlete"), DEFAULT_TABS.athlete);
assert.deepEqual(tabsFromCookie("garbage%", "coach"), DEFAULT_TABS.coach);
console.log("tabs: all passed");
