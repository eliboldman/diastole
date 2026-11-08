"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

/** Never show this tip or release card again (for this person, on every device). */
export async function dismissTip(id: string) {
  const me = await requireUser();
  if (!/^(tip|new):[a-z0-9-]{1,40}$/.test(id)) return { ok: false as const };
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("seen_tips").eq("id", me.id).maybeSingle();
  const list = [...new Set([...(data?.seen_tips ?? []), id])].slice(-300);
  const { error } = await supabase.from("profiles").update({ seen_tips: list }).eq("id", me.id);
  return error ? { ok: false as const } : { ok: true as const };
}
