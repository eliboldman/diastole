// Run with: node lib/ai/scenarios.test.ts
// Feeds each AI test-mode scenario through the real readiness engine and checks the flags it produces.
import assert from "node:assert/strict";

import { computeReadiness } from "../readiness/engine.ts";
import { generateScenario, type Scenario } from "./scenarios.ts";

const today = "2026-11-04";
const expected: Record<Scenario, { overall: string; check?: (r: ReturnType<typeof computeReadiness>) => void }> = {
  poor_sleep: { overall: "red", check: (r) => (assert.equal(r.sleep, "red"), assert.equal(r.recovery, "red")) },
  high_load: { overall: "red", check: (r) => assert.equal(r.load, "red") },
  normal: { overall: "green" },
  missing_data: { overall: "yellow", check: (r) => assert.equal(r.sleep, "unknown") },
};

(Object.keys(expected) as Scenario[]).forEach((key, i) => {
  const { wellness, activities } = generateScenario(key, today, i);
  const r = computeReadiness(today, wellness, activities);
  console.log(key.padEnd(13), r.overall.padEnd(7), `recovery=${r.recovery} sleep=${r.sleep} stress=${r.stress} load=${r.load}`, "|", r.note);
  assert.equal(r.overall, expected[key].overall, `${key}: expected ${expected[key].overall}, got ${r.overall}`);
  expected[key].check?.(r);
});
console.log("scenarios: all tests passed");
