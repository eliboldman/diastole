import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanItems, STARTERS, type Routine } from "@/lib/recovery/catalog";

/** Public URLs for every move that has a clip: slug → { video, poster }. */
export async function videoMap(supabase: SupabaseClient): Promise<Record<string, { video: string; poster: string | null }>> {
  const { data } = await supabase.from("recovery_videos").select("slug, path, poster");
  const url = (p: string) => supabase.storage.from("recovery").getPublicUrl(p).data.publicUrl;
  return Object.fromEntries((data ?? []).map((v) => [v.slug, { video: url(v.path), poster: v.poster ? url(v.poster) : null }]));
}

/** Starters plus the coach's own routines (the coach's when `coachId` is the viewer, else their coach's). */
export async function routinesFor(supabase: SupabaseClient, coachId: string | null): Promise<Routine[]> {
  if (!coachId) return STARTERS;
  const { data } = await supabase.from("recovery_routines").select("id, title, description, items").eq("coach_id", coachId).order("updated_at", { ascending: false }).limit(100);
  return [...(data ?? []).map((r) => ({ id: r.id, title: r.title, description: r.description, items: cleanItems(r.items) })), ...STARTERS];
}

/**
 * What the player runs, from a key: "starter-calf", a routine id, or "a-<assignment id>". Row-level
 * security decides what the viewer can open.
 */
export async function resolveRoutine(supabase: SupabaseClient, key: string): Promise<(Routine & { assignmentId: string | null }) | null> {
  const starter = STARTERS.find((s) => s.id === key);
  if (starter) return { ...starter, assignmentId: null };
  const a = /^a-([0-9a-f-]{36})$/i.exec(key);
  if (a) {
    const { data } = await supabase.from("recovery_assignments").select("id, title, items").eq("id", a[1]).maybeSingle();
    return data ? { id: key, title: data.title, description: null, items: cleanItems(data.items), assignmentId: data.id } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(key)) return null;
  const { data } = await supabase.from("recovery_routines").select("id, title, description, items").eq("id", key).maybeSingle();
  return data ? { id: data.id, title: data.title, description: data.description, items: cleanItems(data.items), assignmentId: null } : null;
}
