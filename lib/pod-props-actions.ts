"use server";

import { isSticker, MAX_SEND } from "@/lib/pod-stickers";
import { createClient, requireUser } from "@/lib/supabase/server";

export type PropsResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

export async function sendProps(podId: string, toId: string, sticker: string, count: number): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(podId) || !UUID.test(toId) || !isSticker(sticker)) return { ok: false, error: "That sticker doesn't exist." };
  const n = Math.min(MAX_SEND, Math.max(1, Math.floor(count)));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_pod_props", { p_pod: podId, p_to: toId, p_sticker: sticker, p_count: n });
  if (error) return { ok: false, error: "Couldn't send that. Try again." };
  if (data === "self") return { ok: false, error: "You can't heckle yourself. We checked." };
  if (data === "slow") return { ok: false, error: "Easy, menace. Give it a few minutes." };
  if (data) return { ok: false, error: String(data) };
  return { ok: true };
}

export async function hideProps(podId: string, sticker: string): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(podId) || !isSticker(sticker)) return { ok: false, error: "That sticker doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_pod_props", { p_pod: podId, p_sticker: sticker });
  return error ? { ok: false, error: "Couldn't hide that. Try again." } : { ok: true };
}
