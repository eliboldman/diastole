"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach } from "@/lib/supabase/server";

import { DRILLS } from "./insights";

const UUID = /^[0-9a-f-]{36}$/i;

async function current(athleteId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("swim_coaching").select("focus, dismissed, note, video_asked").eq("athlete_id", athleteId).maybeSingle();
  return { supabase, row: { focus: (data?.focus ?? []) as string[], dismissed: (data?.dismissed ?? {}) as Record<string, string>, note: (data?.note ?? null) as string | null, video_asked: Boolean(data?.video_asked) } };
}

async function write(athleteId: string, patch: Partial<{ focus: string[]; dismissed: Record<string, string>; note: string | null; video_asked: boolean }>) {
  const { supabase, row } = await current(athleteId);
  const { error } = await supabase.from("swim_coaching").upsert({ athlete_id: athleteId, ...row, ...patch, updated_at: new Date().toISOString() }, { onConflict: "athlete_id" });
  revalidatePath(`/athlete/${athleteId}`);
  return { ok: !error };
}

/** Coach: approve a drill (the athlete sees it), drop one, or dismiss a suggestion. */
export async function setDrill(athleteId: string, key: string, action: "approve" | "remove" | "dismiss"): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!UUID.test(athleteId) || !(key in DRILLS)) return { ok: false };
  const { row } = await current(athleteId);
  if (action === "approve") return write(athleteId, { focus: [...row.focus.filter((k) => k !== key), key].slice(-4) });
  if (action === "remove") return write(athleteId, { focus: row.focus.filter((k) => k !== key) });
  return write(athleteId, { dismissed: { ...row.dismissed, [key]: new Date().toISOString().slice(0, 10) } });
}

export async function saveSwimNote(athleteId: string, note: string, videoAsked: boolean): Promise<{ ok: boolean }> {
  await requireCoach();
  if (!UUID.test(athleteId)) return { ok: false };
  return write(athleteId, { note: note.trim().slice(0, 500) || null, video_asked: Boolean(videoAsked) });
}
