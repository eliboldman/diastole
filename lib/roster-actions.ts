"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Send the same message to several athletes, each in their own one-to-one chat. */
export async function bulkMessage(athleteIds: string[], text: string): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const me = await requireCoach();
  const body = text.trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Write a message first." };
  const ids = [...new Set(athleteIds.filter((id) => UUID.test(id) && id !== me.id))].slice(0, 100);
  if (!ids.length) return { ok: false, error: "Pick at least one athlete." };
  const supabase = await createClient();
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const { data: conv } = await supabase.rpc("open_direct_conversation", { p_other: id });
    if (!conv) { failed++; continue; }
    const { error } = await supabase.from("messages").insert({ id: crypto.randomUUID(), conversation_id: conv, sender_id: me.id, body });
    if (error) failed++;
    else sent++;
  }
  revalidatePath("/messages");
  return { ok: true, sent, failed };
}
