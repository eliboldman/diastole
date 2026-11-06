import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { costOf, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { cleanEstimate, type EstimateItem } from "@/lib/fuel/meals";
import { createAdminClient, type Profile } from "@/lib/supabase/server";

// Meal photo or description -> foods with carb/protein/fat ranges. Shown straight to the athlete
// (Eli approved this exception to "AI waits for the coach"). The photo is passed through, never stored.
// Cheapest model per job: Haiku reads food photos well enough for rough ranges.
const MEAL_MODEL: AiModel = "claude-haiku-5-5";
export const DAILY_LIMIT = 30; // estimates per athlete per day

const SYSTEM = `You estimate what is in an athlete's meal, from a photo and/or their description, for a sports fueling log.

List each distinct food or drink you can identify. For each, give:
- name: short and plain ("white rice", "grilled chicken breast", "orange juice")
- portion: a household estimate ("about 1 cup", "1 medium", "2 slices", "about 150 g")
- carbs, protein and fat as ranges in grams (low and high), honest about uncertainty: wider when the portion or recipe is unclear, never a zero-width range unless the food truly has none of it.

Use the athlete's description to correct or add foods (it wins over the photo, e.g. "the milk is oat milk", "I only ate half"). Count hidden calories that are clearly present (cooking oil, butter, dressings, sauces) as their own items when visible or likely.

If there is no food or drink in the input, return no items and say so in "note". Keep "note" to one short neutral sentence, or empty. Never comment on whether the meal is healthy, good or bad, too much or too little; no diet advice.`;

const Output = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        portion: z.string(),
        carbs_low: z.number(),
        carbs_high: z.number(),
        protein_low: z.number(),
        protein_high: z.number(),
        fat_low: z.number(),
        fat_high: z.number(),
      }),
    )
    .describe("Each food or drink, at most 20"),
  label: z.string().describe("2-4 word name for the meal, like 'Chicken rice bowl'"),
  note: z.string().describe("One short neutral sentence, or empty"),
});

export type EstimateResult = { ok: true; items: EstimateItem[]; label: string; note: string } | { ok: false; error: string };

/** The coach whose AI budget pays for this athlete's estimates. */
export function payerOf(me: Profile): string | null {
  if (me.coach_id) return me.coach_id;
  return me.role === "coach" ? me.id : null;
}

export async function estimateMeal(me: Profile, input: { imageBase64?: string | null; text?: string | null }): Promise<EstimateResult> {
  const text = (input.text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const image = input.imageBase64 ?? null;
  if (!image && !text) return { ok: false, error: "Add a photo or describe the meal." };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Meal estimates aren't set up yet." };
  const payer = payerOf(me);
  if (!payer) return { ok: false, error: "Meal estimates turn on once you have a coach." };

  const admin = createAdminClient();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [{ data: s }, spent, { count }] = await Promise.all([
    admin.from("coach_settings").select("ai_enabled, ai_monthly_cap_usd").eq("coach_id", payer).maybeSingle(),
    monthToDateSpend(payer),
    admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("athlete_id", me.id).eq("trigger", "meal").gte("created_at", dayAgo),
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.ai_enabled) return { ok: false, error: "Meal estimates are turned off by your coach right now. You can still log a usual meal." };
  if (spent >= Number(settings.ai_monthly_cap_usd) - 0.01) return { ok: false, error: "Meal estimates are paused for the rest of the month. You can still log a usual meal." };
  if ((count ?? 0) >= DAILY_LIMIT) return { ok: false, error: "That's the most estimates for one day. You can still log a usual meal." };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } });
  content.push({ type: "text", text: text ? `Athlete's description: ${text}` : "No description; estimate from the photo." });

  const client = new Anthropic();
  let response;
  try {
    response = await client.beta.messages.parse({
      model: MEAL_MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Output) },
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude is busy right now. Try again in a moment." };
    if (e instanceof Anthropic.BadRequestError) return { ok: false, error: "That photo couldn't be read. Try another, or describe the meal." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Couldn't estimate right now (error ${e.status}).` };
    throw e;
  }

  await admin.from("ai_usage").insert({
    coach_id: payer,
    athlete_id: me.id,
    model: MEAL_MODEL,
    athletes: 1,
    input_tokens: response.usage.input_tokens ?? 0,
    output_tokens: response.usage.output_tokens ?? 0,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
    cost_usd: costOf(MEAL_MODEL, response.usage).toFixed(5),
    stop_reason: response.stop_reason,
    trigger: "meal",
  });
  if (response.stop_reason === "refusal") return { ok: false, error: "Couldn't estimate that one. Try describing the meal instead." };
  const out = response.parsed_output;
  const items = cleanEstimate(
    (out?.items ?? []).map((i) => ({
      name: i.name,
      portion: i.portion,
      carbs: [i.carbs_low, i.carbs_high],
      protein: [i.protein_low, i.protein_high],
      fat: [i.fat_low, i.fat_high],
    })),
  );
  const note = (out?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!items.length) return { ok: false, error: note || "No food found. Try another photo, or describe the meal." };
  return { ok: true, items, label: (out?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 60), note };
}
