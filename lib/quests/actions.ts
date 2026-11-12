"use server";

import { revalidatePath } from "next/cache";

import { settleGrit } from "@/lib/grit/settle";
import { getRestDay } from "@/lib/quests/data";
import { questTextProblem } from "@/lib/quests/quests";
import { createAdminClient, createClient, requireCoach, requireUser } from "@/lib/supabase/server";

export type QuestResult = { ok: true; grit?: number } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;

/** Tick off one of today's quests (only today's, only on a rest day). Grit lands right away. */
export async function completeQuest(key: string): Promise<QuestResult> {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const quests = await getRestDay(supabase, me.id, today, me.timezone);
  const q = quests?.find((x) => x.key === key);
  if (!q) return { ok: false, error: "That quest isn't on today's list." };
  if (q.done) return { ok: true };
  const admin = createAdminClient();
  const { error } = await admin.from("quest_completions").insert({ athlete_id: me.id, date: today, quest_key: q.key, title: q.title.slice(0, 60), grit: q.grit });
  if (error && error.code !== "23505") return { ok: false, error: "Couldn't save that. Try again." };
  await settleGrit(me.id).catch(() => 0);
  revalidatePath("/me");
  return { ok: true, grit: q.grit };
}

/** Changed your mind (same day): take the tick and its grit back. */
export async function undoQuest(key: string): Promise<QuestResult> {
  const me = await requireUser();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const admin = createAdminClient();
  const { data: row } = await admin.from("quest_completions").select("auto").eq("athlete_id", me.id).eq("date", today).eq("quest_key", key).maybeSingle();
  if (!row) return { ok: true };
  if (row.auto) return { ok: false, error: "Your watch already counted this one." };
  await admin.from("quest_completions").delete().eq("athlete_id", me.id).eq("date", today).eq("quest_key", key);
  await admin.from("grit_ledger").delete().eq("athlete_id", me.id).eq("kind", "quest").eq("ref", `${today}:${key}`);
  revalidatePath("/me");
  return { ok: true };
}

/** A coach's own quest, for one athlete or (athleteId null) all of their athletes. */
export async function addRestQuest(input: { title: string; blurb: string; athleteId: string | null; grit: number }): Promise<QuestResult> {
  const coach = await requireCoach();
  const title = input.title.replace(/\s+/g, " ").trim();
  const blurb = input.blurb.replace(/\s+/g, " ").trim();
  const problem = questTextProblem(title, blurb);
  if (problem) return { ok: false, error: problem };
  if (input.athleteId && !UUID.test(input.athleteId)) return { ok: false, error: "Pick an athlete." };
  const grit = Math.min(25, Math.max(5, Math.round(input.grit || 10)));
  const supabase = await createClient();
  const { error } = await supabase.from("rest_quests").insert({ coach_id: coach.id, athlete_id: input.athleteId, title, blurb: blurb || null, grit });
  if (error) return { ok: false, error: "Couldn't add that quest. Check the athlete is yours." };
  revalidatePath("/recovery");
  return { ok: true };
}

export async function removeRestQuest(id: string): Promise<QuestResult> {
  await requireCoach();
  if (!UUID.test(id)) return { ok: false, error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("rest_quests").update({ active: false }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove it." };
  revalidatePath("/recovery");
  return { ok: true };
}
