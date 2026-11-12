// Confidence bank on the server: refresh the automatic entries, read the bank.
import type { SupabaseClient } from "@supabase/supabase-js";

import { PR_LABEL } from "@/lib/avatar/pr-labels";
import { collect, type Entry } from "@/lib/confidence/collect";

const DAY = 86_400_000;
export type BankEntry = Entry & { id: string; hidden: boolean };

/** Save any new proof moments from the last six months (admin client; safe to repeat). */
export async function refreshBank(admin: SupabaseClient, athleteId: string) {
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const [{ data: prof }, { data: acts }, { data: checks }, { data: ready }, { data: ach }, { data: conv }] = await Promise.all([
    admin.from("profiles").select("timezone, coach_id").eq("id", athleteId).maybeSingle(),
    admin.from("activities").select("id, sport, start_time, duration_s, name").eq("athlete_id", athleteId).gte("start_time", since).gte("duration_s", 600).order("start_time").limit(1500),
    admin.from("workout_checkins").select("activity_id, rpe, feel, pain, note").eq("athlete_id", athleteId).gte("created_at", since).limit(1500),
    admin.from("readiness_scores").select("date, overall").eq("athlete_id", athleteId).gte("date", since.slice(0, 10)),
    admin.from("achievements").select("key, value, achieved_at, activity_id").eq("athlete_id", athleteId).gte("achieved_at", since),
    admin.from("conversations").select("id, coach_id").eq("kind", "direct").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  if (!prof) return 0;
  const { data: praise } = conv ? await admin.from("messages").select("id, body, created_at").eq("conversation_id", conv.id).eq("sender_id", conv.coach_id).is("deleted_at", null).not("body", "is", null).gte("created_at", since).limit(500) : { data: [] };
  const entries = collect({
    tz: prof.timezone || "America/Chicago",
    acts: acts ?? [],
    checkins: (checks ?? []).map((c) => ({ ...c, pain: (c.pain ?? {}) as Record<string, number> })),
    readiness: Object.fromEntries((ready ?? []).map((r) => [r.date, r.overall as string])),
    achievements: ach ?? [],
    praise: (praise ?? []).map((m) => ({ id: m.id, body: String(m.body), created_at: m.created_at })),
    prLabel: PR_LABEL,
  });
  if (!entries.length) return 0;
  const { data } = await admin
    .from("confidence_entries")
    .upsert(entries.map((e) => ({ athlete_id: athleteId, kind: e.kind, ref: e.ref, title: e.title.slice(0, 120), detail: e.detail?.slice(0, 400) ?? null, date: e.date, activity_id: e.activity_id ?? null })), { onConflict: "athlete_id,kind,ref", ignoreDuplicates: true })
    .select("id");
  return data?.length ?? 0;
}

export async function getBank(supabase: SupabaseClient, athleteId: string): Promise<BankEntry[]> {
  const { data } = await supabase.from("confidence_entries").select("id, kind, ref, title, detail, date, activity_id, hidden").eq("athlete_id", athleteId).order("date", { ascending: false }).limit(300);
  return (data ?? []) as BankEntry[];
}
