// Reading grit for pages (server only). Balance = sum of the ledger.
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/server";

export type LedgerRow = { id: number; amount: number; kind: string; reason: string | null; detail: Record<string, unknown> | null; created_at: string };
export type GritState = { balance: number; history: LedgerRow[]; owned: Record<string, number>; fresh: LedgerRow[] };

/** Balance, recent history, what they own, and awards newer than the last time they saw grit. */
export async function getGrit(supabase: SupabaseClient, athleteId: string, seenAt: string | null, historyLimit = 40): Promise<GritState> {
  const [{ data: all }, { data: items }] = await Promise.all([
    supabase.from("grit_ledger").select("id, amount, kind, reason, detail, created_at").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(5000),
    supabase.from("grit_items").select("item_id, qty").eq("athlete_id", athleteId),
  ]);
  // Newest first by the day it was earned (a session's own date), not when it was paid out.
  const dayOf = (r: LedgerRow) => (typeof r.detail?.day === "string" ? r.detail.day : r.created_at.slice(0, 10));
  const rows = ((all ?? []) as LedgerRow[]).sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const balance = rows.reduce((s, r) => s + r.amount, 0);
  const fresh = rows.filter((r) => r.amount > 0 && (!seenAt || r.created_at > seenAt));
  return { balance, history: rows.slice(0, historyLimit), owned: Object.fromEntries((items ?? []).map((i) => [i.item_id, i.qty])), fresh };
}

/** Store themes this person owns (checked when a theme is saved and in Appearance). */
export async function ownedThemes(athleteId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("grit_items").select("item_id").eq("athlete_id", athleteId).like("item_id", "theme:%");
  return (data ?? []).map((r) => String(r.item_id).slice(6));
}
