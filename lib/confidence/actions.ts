"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient, requireUser } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

/** Add your own proof: a moment you want to remember before the big day. */
export async function addOwnEntry(title: string, detail: string, date: string): Promise<Result> {
  const me = await requireUser();
  const t = title.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t) return { ok: false, error: "Give it a few words." };
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const { error } = await createAdminClient().from("confidence_entries").insert({ athlete_id: me.id, kind: "own", ref: crypto.randomUUID(), title: t, detail: detail.trim().slice(0, 400) || null, date: d });
  if (error) return { ok: false, error: "Couldn't save that." };
  revalidatePath("/me/confidence");
  return { ok: true };
}

/** Hide (or bring back) an entry. Hidden ones stay out of the summary too. */
export async function setEntryHidden(id: string, hidden: boolean): Promise<Result> {
  const me = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Not found." };
  const { error } = await createAdminClient().from("confidence_entries").update({ hidden }).eq("id", id).eq("athlete_id", me.id);
  if (error) return { ok: false, error: "Couldn't change that." };
  revalidatePath("/me/confidence");
  return { ok: true };
}
