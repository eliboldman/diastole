// Free check (no API calls): every structured output stays inside Claude's schema limits.
// Going over returns a 400 for every request, e.g. "too many parameters with union types".
import assert from "node:assert/strict";

import { unionParams, UNION_LIMIT } from "./schema-limits.ts";
import { BuildOut, FixOut, PlanOut } from "./step-schema.ts";

for (const [name, schema] of Object.entries({ BuildOut, PlanOut, FixOut })) {
  const n = unionParams(schema);
  assert.ok(n <= UNION_LIMIT, `${name} has ${n} nullable/union parameters; the API allows ${UNION_LIMIT}`);
}
console.log("schema limits: all passed");
