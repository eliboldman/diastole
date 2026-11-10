"use server";

import { revalidatePath } from "next/cache";

import { draftMorningBriefs } from "@/lib/ai/briefs";
import { runCoachAssistant } from "@/lib/ai/coach";
import { requireCoach } from "@/lib/supabase/server";

/**
 * The coach's "review this morning's markers" button: the coaching assistant (flags from fresh
 * readiness) and morning briefs, for athletes whose overnight data is in. Safe to press again later;
 * athletes already handled today are skipped.
 */
export async function runMorningReview(): Promise<{ ok: boolean; message: string }> {
  const coach = await requireCoach();
  const [assistant, briefs] = [await runCoachAssistant(coach.id, "manual"), await draftMorningBriefs(coach.id, { onlyReady: true })];
  revalidatePath("/dashboard");
  const parts: string[] = [];
  if (assistant.status === "skipped") parts.push(assistant.reason);
  else parts.push(`${assistant.suggestions} coaching ${assistant.suggestions === 1 ? "suggestion" : "suggestions"}`);
  if (briefs.status === "skipped") parts.push(briefs.reason);
  else parts.push(`${briefs.drafted} morning ${briefs.drafted === 1 ? "brief" : "briefs"} drafted`);
  const cost = (assistant.status !== "skipped" ? assistant.costUsd : 0) + (briefs.status !== "skipped" ? briefs.costUsd : 0);
  return { ok: true, message: `${parts.join(". ")}.${cost ? ` ($${cost.toFixed(3)})` : ""}` };
}
