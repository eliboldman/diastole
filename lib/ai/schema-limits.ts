// Claude's structured outputs refuse schemas with more than 16 nullable or union-typed parameters
// ("exponential compilation cost"). Counted like the API: each property in the generated JSON schema,
// where a reused zod schema becomes one shared $defs entry and so counts once.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const UNION_LIMIT = 16;

export function unionParams(schema: z.ZodTypeAny): number {
  const json = (betaZodOutputFormat(schema) as unknown as { schema: unknown }).schema;
  let n = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const o = node as Record<string, unknown>;
    if (o.properties && typeof o.properties === "object") {
      for (const p of Object.values(o.properties as Record<string, unknown>)) {
        const q = p as Record<string, unknown>;
        if (Array.isArray(q.type) || Array.isArray(q.anyOf)) n++;
      }
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return n;
}
