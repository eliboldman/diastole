"use server";

import { revalidatePath } from "next/cache";

import { moveBySlug, SCREEN_CLIPS } from "@/lib/recovery/catalog";
import { SITE } from "@/lib/site";
import { createAdminClient, requireCoach } from "@/lib/supabase/server";

// Demo clips are the head coach's videos, shown to every athlete, so only the site owner films them.
const BUCKET = "recovery";
const MAX_VIDEO = 20 * 1024 * 1024; // the bucket's own limit

async function requireOwner() {
  const me = await requireCoach();
  if (me.email?.toLowerCase() !== SITE.contactEmail.toLowerCase()) throw new Error("Only the head coach films demo clips.");
  return me;
}

const isClip = (slug: string) => !!moveBySlug(slug) || SCREEN_CLIPS.some((c) => c.slug === slug);

/**
 * Upload slots for a new take: a versioned clip + poster path (so a re-film isn't hidden behind the
 * week-long public cache) and signed tokens to upload straight from the phone.
 */
export async function startClipUpload(slug: string): Promise<{ ok: true; video: { path: string; token: string }; poster: { path: string; token: string } } | { ok: false; error: string }> {
  await requireOwner();
  if (!isClip(slug)) return { ok: false, error: "Unknown clip." };
  const stamp = Date.now().toString(36);
  const admin = createAdminClient();
  const video = `clips/${slug}-${stamp}.mp4`;
  const poster = `posters/${slug}-${stamp}.jpg`;
  const [v, p] = await Promise.all([admin.storage.from(BUCKET).createSignedUploadUrl(video), admin.storage.from(BUCKET).createSignedUploadUrl(poster)]);
  if (v.error || p.error) return { ok: false, error: "Couldn't start the upload. Try again." };
  return { ok: true, video: { path: video, token: v.data.token }, poster: { path: poster, token: p.data.token } };
}

/** After both files are up: point the move at the new take and delete the old one. */
export async function finishClipUpload(slug: string, video: string, poster: string, seconds: number): Promise<{ ok: boolean; error?: string }> {
  await requireOwner();
  const esc = slug.replace(/[^a-z0-9-]/g, "");
  if (!isClip(slug) || !new RegExp(`^clips/${esc}-[a-z0-9]+\\.mp4$`).test(video) || !new RegExp(`^posters/${esc}-[a-z0-9]+\\.jpg$`).test(poster)) {
    return { ok: false, error: "That upload doesn't look right." };
  }
  const admin = createAdminClient();
  const file = video.split("/")[1];
  const { data: found } = await admin.storage.from(BUCKET).list("clips", { search: file, limit: 1 });
  const obj = found?.find((f) => f.name === file);
  const size = Number((obj?.metadata as { size?: number } | null)?.size ?? 0);
  if (!obj || size <= 0) return { ok: false, error: "The upload didn't finish. Try again." };
  if (size > MAX_VIDEO) {
    await admin.storage.from(BUCKET).remove([video, poster]);
    return { ok: false, error: "That clip came out over 20 MB. Film a shorter take." };
  }
  const { data: old } = await admin.from("recovery_videos").select("path, poster").eq("slug", slug).maybeSingle();
  const secs = Math.min(60, Math.max(1, Math.round(Number(seconds) * 10) / 10 || 20));
  const { error } = await admin.from("recovery_videos").upsert({ slug, path: video, poster, seconds: secs, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save that clip." };
  const stale = [old?.path, old?.poster].filter((p): p is string => !!p && p !== video && p !== poster);
  if (stale.length) await admin.storage.from(BUCKET).remove(stale);
  revalidatePath("/recovery/film");
  revalidatePath("/lab/recovery");
  return { ok: true };
}
