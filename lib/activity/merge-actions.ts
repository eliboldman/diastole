"use server";

import { revalidatePath } from "next/cache";

import { restoreMerge } from "@/lib/activity/merge";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

/** "Keep both": undo a duplicate merge. The athlete or their coach (row-level security decides). */
export async function undoMerge(mergeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(mergeId)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { data: m } = await supabase.from("activity_merges").select("id, kept_id, row, filled, moved_details, undone_at").eq("id", mergeId).maybeSingle();
  if (!m || m.undone_at) return { ok: false, error: "Already undone." };
  const err = await restoreMerge(createAdminClient(), m as never);
  if (err) return { ok: false, error: "Couldn't undo the merge." };
  revalidatePath(`/activity/${m.kept_id}`);
  return { ok: true };
}
