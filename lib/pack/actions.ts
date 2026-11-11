"use server";

import { revalidatePath } from "next/cache";

import { createClient, requireCoach, requireUser } from "@/lib/supabase/server";

import { BAGS, cleanMaster, cleanPackState, type Bag, type Travel } from "./pack";

const UUID = /^[0-9a-f-]{36}$/i;
type Patch = { check?: { key: string; on: boolean }; add?: { label: string; bag: Bag }; remove?: string; travel?: Travel; waterC?: number | null };

/** Tick an item, add or remove your own, set travel or water temperature. Athlete or coach (RLS). */
export async function updatePack(raceId: string, patch: Patch): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  if (!UUID.test(raceId)) return { ok: false, error: "Unknown race." };
  const supabase = await createClient();
  const { data: race } = await supabase.from("races").select("pack").eq("id", raceId).maybeSingle();
  if (!race) return { ok: false, error: "Unknown race." };
  const s = cleanPackState(race.pack);
  if (patch.check && patch.check.key.length <= 80) {
    if (patch.check.on) s.checked[patch.check.key] = true;
    else delete s.checked[patch.check.key];
  }
  if (patch.add) {
    const label = patch.add.label.trim().slice(0, 80);
    if (label && BAGS.some((b) => b.key === patch.add!.bag) && s.extra.length < 40 && !s.extra.some((e) => e.label.toLowerCase() === label.toLowerCase())) s.extra.push({ label, bag: patch.add.bag });
  }
  if (patch.remove) s.extra = s.extra.filter((e) => e.label !== patch.remove);
  if (patch.travel) s.travel = patch.travel;
  if (patch.waterC !== undefined) s.waterC = patch.waterC;
  const { error } = await supabase.from("races").update({ pack: cleanPackState(s) }).eq("id", raceId);
  revalidatePath(`/races/${raceId}`);
  revalidatePath("/me");
  return error ? { ok: false, error: "Couldn't save." } : { ok: true };
}

/** Coach: the master list merged into every athlete's packing list. */
export async function saveMasterList(items: unknown): Promise<{ ok: boolean; error?: string }> {
  const coach = await requireCoach();
  const supabase = await createClient();
  const { error } = await supabase.from("coach_pack_lists").upsert({ coach_id: coach.id, items: cleanMaster(items), updated_at: new Date().toISOString() }, { onConflict: "coach_id" });
  revalidatePath("/library");
  return error ? { ok: false, error: "Couldn't save." } : { ok: true };
}
