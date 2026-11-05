"use server";

import { isSticker, MAX_SEND, NOTE_MAX } from "@/lib/pod-stickers";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireUser } from "@/lib/supabase/server";

export type PropsResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

export async function sendProps(podId: string, toId: string, sticker: string, count: number, note?: string, activityId?: string | null): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(podId) || !UUID.test(toId) || !isSticker(sticker)) return { ok: false, error: "That sticker doesn't exist." };
  if (activityId && !UUID.test(activityId)) return { ok: false, error: "That workout doesn't exist." };
  const n = Math.min(MAX_SEND, Math.max(1, Math.floor(count)));
  const clean = (note ?? "").replace(/\s+/g, " ").trim();
  if (clean.length > NOTE_MAX) return { ok: false, error: `Keep the note to ${NOTE_MAX} characters.` };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_pod_props", { p_pod: podId, p_to: toId, p_sticker: sticker, p_count: n, p_note: clean || null, p_activity: activityId || null });
  if (error) return { ok: false, error: "Couldn't send that. Try again." };
  if (data === "self") return { ok: false, error: "You can't heckle yourself. We checked." };
  if (data === "slow") return { ok: false, error: "Easy, menace. Give it a few minutes." };
  if (data) return { ok: false, error: String(data) };
  return { ok: true };
}

export async function hideProps(podId: string, sticker: string, activityId?: string | null): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(podId) || !isSticker(sticker) || (activityId && !UUID.test(activityId))) return { ok: false, error: "That sticker doesn't exist." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_pod_props", { p_pod: podId, p_sticker: sticker, p_activity: activityId || null });
  return error ? { ok: false, error: "Couldn't hide that. Try again." } : { ok: true };
}

/** Hide a single send (and its note) that was sent to you. */
export async function hideOneProp(id: string): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Couldn't hide that." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("hide_pod_prop", { p_id: id });
  return error ? { ok: false, error: "Couldn't hide that. Try again." } : { ok: true };
}

/** The next page of a pod's activity feed, older than `before`. */
export async function loadPodActivities(podId: string, before: string): Promise<FeedItem[]> {
  await requireUser();
  if (!UUID.test(podId) || Number.isNaN(Date.parse(before))) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_pod_activity_feed", { p_pod: podId, p_before: before, p_limit: FEED_PAGE });
  return (data ?? []) as FeedItem[];
}

/** A free-text comment on an activity in the pod feed (the owner can reply on their own). */
export async function sendComment(podId: string, toId: string, activityId: string, text: string): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(podId) || !UUID.test(toId) || !UUID.test(activityId)) return { ok: false, error: "That workout doesn't exist." };
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return { ok: false, error: "Write something first." };
  if (clean.length > NOTE_MAX) return { ok: false, error: `Keep it to ${NOTE_MAX} characters.` };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_pod_props", { p_pod: podId, p_to: toId, p_sticker: "comment", p_count: 1, p_note: clean, p_activity: activityId });
  if (error) return { ok: false, error: "Couldn't post that. Try again." };
  if (data === "slow") return { ok: false, error: "Easy, menace. Give it a few minutes." };
  if (data) return { ok: false, error: String(data) };
  return { ok: true };
}

export async function deleteComment(id: string): Promise<PropsResult> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Couldn't delete that." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_pod_comment", { p_id: id });
  return error ? { ok: false, error: "Couldn't delete that. Try again." } : { ok: true };
}
