"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

const BUCKET = "swim-video";
const KEEP = 2; // newest clips kept per athlete
const MAX_BYTES = 50 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;
const PATH = /^([0-9a-f-]{36})\/[0-9a-f-]{36}\.(mp4|mov|webm)$/i;

export type SwimVideo = { id: string; url: string | null; athleteNote: string | null; coachNote: string | null; createdAt: string; repliedAt: string | null };

/** The athlete's clips, newest first, with short-lived links. Caller's client; RLS applies. */
export async function listSwimVideos(athleteId: string): Promise<SwimVideo[]> {
  if (!UUID.test(athleteId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("swim_videos").select("id, path, athlete_note, coach_note, created_at, replied_at").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(KEEP);
  if (!data?.length) return [];
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(data.map((v) => v.path), 60 * 60 * 3);
  const urlOf = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((v) => ({ id: v.id, url: urlOf.get(v.path) ?? null, athleteNote: v.athlete_note, coachNote: v.coach_note, createdAt: v.created_at, repliedAt: v.replied_at }));
}

/** Athlete: record a clip they just uploaded to their own folder, then drop clips beyond the newest two. */
export async function saveSwimVideo(path: string, note: string): Promise<{ ok: boolean; error?: string }> {
  const me = await requireUser();
  const m = PATH.exec(path);
  if (!m || m[1] !== me.id) return { ok: false, error: "That upload doesn't look right." };
  const admin = createAdminClient();
  const [folder, file] = path.split("/");
  const { data: found } = await admin.storage.from(BUCKET).list(folder, { search: file, limit: 1 });
  const obj = found?.find((f) => f.name === file);
  if (!obj) return { ok: false, error: "The upload didn't finish. Try again." };
  const bytes = Number((obj.metadata as { size?: number } | null)?.size ?? 0) || null;
  if (bytes && bytes > MAX_BYTES) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: "That clip is over 50 MB. Trim it to 15–20 seconds." };
  }
  const { error } = await admin.from("swim_videos").insert({ athlete_id: me.id, path, bytes, athlete_note: note.trim().slice(0, 300) || null });
  if (error) return { ok: false, error: "Couldn't save that clip." };
  const { data: all } = await admin.from("swim_videos").select("id, path").eq("athlete_id", me.id).order("created_at", { ascending: false });
  const old = (all ?? []).slice(KEEP);
  if (old.length) {
    await admin.storage.from(BUCKET).remove(old.map((v) => v.path));
    await admin.from("swim_videos").delete().in("id", old.map((v) => v.id));
  }
  revalidatePath("/training");
  return { ok: true };
}

/** Coach: reply to a clip (the athlete is notified). */
export async function replySwimVideo(id: string, note: string): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false };
  const supabase = await createClient();
  const { data: v } = await supabase.from("swim_videos").select("id, athlete_id").eq("id", id).maybeSingle(); // RLS: only their coach (or the athlete) sees it
  if (!v) return { ok: false };
  const text = note.trim().slice(0, 1000);
  if (!text) return { ok: false };
  const { error } = await createAdminClient().from("swim_videos").update({ coach_note: text, replied_at: new Date().toISOString() }).eq("id", id);
  revalidatePath(`/athlete/${v.athlete_id}`);
  return { ok: !error };
}

/** The athlete or their coach removes a clip. */
export async function deleteSwimVideo(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (!UUID.test(id)) return { ok: false };
  const supabase = await createClient();
  const { data: v } = await supabase.from("swim_videos").select("id, path, athlete_id").eq("id", id).maybeSingle();
  if (!v) return { ok: false };
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([v.path]);
  await admin.from("swim_videos").delete().eq("id", id);
  revalidatePath("/training");
  revalidatePath(`/athlete/${v.athlete_id}`);
  return { ok: true };
}
