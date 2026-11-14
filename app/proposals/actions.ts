"use server";

import { revalidatePath } from "next/cache";

import { decideProposal } from "@/lib/autocoach/server";
import { requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const CHOICES = new Set(["check", "easy", "rest", "keep", "move", "drop", "apply", "decline"]);

/** The signed-in athlete decides one of their own proposals (decideProposal checks ownership). */
export async function decide(id: string, choice: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireUser();
  if (!UUID.test(id) || !CHOICES.has(choice)) return { ok: false, message: "Unknown choice." };
  const r = await decideProposal(id, me.id, choice);
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/calendar");
  return r;
}
