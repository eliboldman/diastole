"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireUser } from "@/lib/supabase/server";

export type RenameResult = { ok: true; name: string | null } | { ok: false; error: string };

/** Rename an activity (owner or their coach). An empty name goes back to the watch's own name. */
export async function renameActivity(id: string, name: string): Promise<RenameResult> {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That workout doesn't exist." };
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length > 80) return { ok: false, error: "Keep the name to 80 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_activity", { p_id: id, p_name: clean });
  if (error) return { ok: false, error: "Couldn't rename that. Try again." };
  if (data) return { ok: false, error: String(data) };
  const { data: row } = await supabase.from("activities").select("name").eq("id", id).maybeSingle();
  revalidatePath(`/activity/${id}`);
  return { ok: true, name: row?.name ?? null };
}
