"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

/** Replace this person's saved replies (strings, 1-500 chars, at most 30). */
export async function setSavedReplies(list: string[]): Promise<{ ok: boolean }> {
  await requireUser();
  const clean = [...new Set(list.map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length <= 500))].slice(0, 30);
  const { data, error } = await (await createClient()).rpc("set_saved_replies", { p_list: clean });
  return { ok: !error && data === true };
}
