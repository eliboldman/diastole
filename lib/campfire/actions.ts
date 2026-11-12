"use server";

import { revalidatePath } from "next/cache";

import { fireWindow } from "@/lib/campfire/campfire";
import { podTimeZone } from "@/lib/campfire/data";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
type Media = { path: string; kind: "voice" | "photo" } | null;

/** Add (or update) your log at this week's campfire. Only while it's lit, only in your own pod. */
export async function saveLog(podId: string, input: { highlight: string; struggle: string; h: Media; s: Media }): Promise<Result> {
  const me = await requireUser();
  if (!UUID.test(podId)) return { ok: false, error: "Pod not found." };
  const supabase = await createClient();
  const [{ data: member }, { data: coach }] = await Promise.all([supabase.rpc("in_pod", { p_pod: podId }), supabase.rpc("is_pod_coach", { p_pod: podId })]);
  if (!member) return { ok: false, error: "You're not in this pod." };
  const admin = createAdminClient();
  const w = fireWindow(new Date(), await podTimeZone(admin, podId));
  if (!w.open) return { ok: false, error: "The campfire's out until Sunday evening." };
  const clean = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 280) || null;
  const mine = (m: Media) => (m && m.path.startsWith(`${podId}/${me.id}/`) && m.path.length <= 200 && (m.kind === "voice" || m.kind === "photo") ? m : null);
  const h = mine(input.h), s = mine(input.s);
  const row = { highlight: clean(input.highlight), struggle: clean(input.struggle), h_media: h?.path ?? null, h_kind: h?.kind ?? null, s_media: s?.path ?? null, s_kind: s?.kind ?? null };
  if (!row.highlight && !row.struggle && !h && !s) return { ok: false, error: "Add a highlight, a struggle, or a voice note first." };

  const { data: fire, error: fireErr } = await admin.from("campfires").upsert({ pod_id: podId, week: w.week, opens_at: w.opensAt, closes_at: w.closesAt }, { onConflict: "pod_id,week" }).select("id").single();
  if (fireErr || !fire) return { ok: false, error: "Couldn't light it. Try again." };
  const { error } = await admin.from("campfire_logs").upsert({ campfire_id: fire.id, pod_id: podId, author_id: me.id, is_coach: Boolean(coach), ...row, updated_at: new Date().toISOString() }, { onConflict: "campfire_id,author_id" });
  if (error) return { ok: false, error: "Couldn't add your log. Try again." };
  revalidatePath(`/me/pods/${podId}`);
  revalidatePath(`/pods/${podId}`);
  return { ok: true };
}
