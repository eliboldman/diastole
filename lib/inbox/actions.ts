"use server";

import { revalidatePath } from "next/cache";

import { approveSuggestion, dismissSuggestion } from "@/lib/ai/actions";
import { sendBrief, skipBrief } from "@/lib/ai/brief-actions";
import { approveBoss, skipBoss } from "@/lib/bosses/actions";
import type { InboxType } from "@/lib/inbox/data";
import { discardEpisode, saveEpisode } from "@/lib/stories/actions";
import { applyStrengthSuggestion, dismissStrengthSuggestion } from "@/lib/strength/actions";
import { approveRequest, declineRequest } from "@/lib/workouts/athlete-actions";
import { decidePlanChange } from "@/lib/workouts/life-actions";
import { requireCoach } from "@/lib/supabase/server";

type R = { ok: boolean; error?: string };
const norm = (r: unknown): R => {
  const x = r as { ok?: boolean; error?: string } | null;
  return { ok: x?.ok !== false, error: x?.error };
};

/** Approve or dismiss one inbox item with the same action its own screen uses. */
export async function decideInbox(type: InboxType, id: string, approve: boolean, extra?: { body?: string; title?: string }): Promise<R> {
  await requireCoach();
  let r: unknown;
  switch (type) {
    case "suggestion": r = approve ? await approveSuggestion(id) : await dismissSuggestion(id); break;
    case "boss": r = approve ? await approveBoss(id) : await skipBoss(id); break;
    case "plan_change": r = await decidePlanChange(id, approve); break;
    case "request": r = approve ? await approveRequest(id) : await declineRequest(id); break;
    case "strength": r = approve ? await applyStrengthSuggestion(id) : await dismissStrengthSuggestion(id); break;
    case "brief": r = approve ? await sendBrief(id, extra?.body ?? "") : await skipBrief(id); break;
    case "episode": r = approve ? await saveEpisode(id, extra?.title ?? "", extra?.body ?? "", true) : await discardEpisode(id); break;
  }
  revalidatePath("/inbox");
  return norm(r);
}
