"use server";

import { revalidatePath } from "next/cache";

import { draftEpisode, recapWeekFor } from "@/lib/stories/draft";
import { createAdminClient, createClient, requireCoach } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

async function myPod(podId: string) {
  const coach = await requireCoach();
  if (!UUID.test(podId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_pod_coach", { p_pod: podId });
  return data ? coach : null;
}

/** Coach: draft (or redraft) last week's episode now. */
export async function draftNow(podId: string): Promise<Result> {
  const coach = await myPod(podId);
  if (!coach) return { ok: false, error: "Pod not found." };
  const week = recapWeekFor(new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone }));
  const r = await draftEpisode(createAdminClient(), podId, week, "manual");
  revalidatePath(`/pods/${podId}`);
  return r.ok ? { ok: true } : r;
}

/** Coach: save edits, and post when ready. Only now does the pod see it. */
export async function saveEpisode(id: string, title: string, body: string, post: boolean): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Episode not found." };
  const t = title.replace(/\s+/g, " ").trim().slice(0, 90);
  const b = body.trim().slice(0, 3000);
  if (!t || !b) return { ok: false, error: "Give it a title and some words." };
  const supabase = await createClient();
  const { data: ep } = await supabase.from("storylines").select("id, pod_id, status, title").eq("id", id).maybeSingle(); // RLS: the pod's coach
  if (!ep) return { ok: false, error: "Episode not found." };
  const admin = createAdminClient();
  const { error } = await admin.from("storylines").update({ title: t, body: b, ...(post ? { status: "posted", posted_at: new Date().toISOString() } : {}) }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save it." };
  if (post && ep.status !== "posted") {
    const { data: members } = await admin.from("pod_members").select("athlete_id").eq("pod_id", ep.pod_id).eq("status", "active");
    for (const m of members ?? []) await admin.rpc("server_notify", { p_user: m.athlete_id, p_kind: "storyline", p_title: `New episode: ${t}`, p_body: "Your pod's week, as told by your coach.", p_href: `/me/pods/${ep.pod_id}/episodes`, p_key: `story_post:${id}` });
  }
  revalidatePath(`/pods/${ep.pod_id}`);
  revalidatePath(`/me/pods/${ep.pod_id}`);
  return { ok: true };
}

export async function discardEpisode(id: string): Promise<Result> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Episode not found." };
  const supabase = await createClient();
  const { data: ep } = await supabase.from("storylines").select("pod_id").eq("id", id).eq("status", "draft").maybeSingle();
  if (!ep) return { ok: false, error: "Episode not found." };
  await createAdminClient().from("storylines").update({ status: "discarded" }).eq("id", id);
  revalidatePath(`/pods/${ep.pod_id}`);
  return { ok: true };
}
