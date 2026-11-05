"use server";

import { revalidatePath } from "next/cache";

import { draftMorningBriefs, type BriefRun } from "@/lib/ai/briefs";
import { createClient, requireCoach } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/** Draft today's briefs now instead of waiting for the morning run. */
export async function draftBriefsNow(): Promise<BriefRun> {
  const me = await requireCoach();
  const r = await draftMorningBriefs(me.id);
  revalidatePath("/dashboard");
  return r;
}

/** Send a brief: it becomes an ordinary message from the coach in the athlete's chat. */
export async function sendBrief(id: string, text: string): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const me = await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Unknown brief." };
  const body = text.replace(/\s+$/g, "").trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Write something first, or skip it." };
  const supabase = await createClient();
  const { data: brief } = await supabase.from("morning_briefs").select("id, athlete_id, status").eq("id", id).maybeSingle();
  if (!brief) return { ok: false, error: "That brief isn't yours." };
  if (brief.status !== "pending") return { ok: false, error: "Already handled." };
  const { data: conv } = await supabase.rpc("open_direct_conversation", { p_other: brief.athlete_id });
  if (!conv) return { ok: false, error: "Couldn't open the chat with this athlete." };
  const messageId = crypto.randomUUID();
  const { error } = await supabase.from("messages").insert({ id: messageId, conversation_id: conv, sender_id: me.id, body });
  if (error) return { ok: false, error: "Couldn't send. Try again." };
  await supabase.rpc("decide_brief", { p_id: id, p_status: "sent", p_text: body, p_message: messageId });
  revalidatePath("/dashboard");
  return { ok: true, conversationId: conv as string };
}

export async function skipBrief(id: string): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_brief", { p_id: id, p_status: "skipped" });
  revalidatePath("/dashboard");
  return { ok: !error };
}
