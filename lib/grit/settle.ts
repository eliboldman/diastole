// Pays out grit that's been earned but not yet recorded. Safe to run any time (Me page loads, the
// morning cron): every award has a unique (athlete, kind, ref), so repeats are ignored.
import type { SupabaseClient } from "@supabase/supabase-js";

import { campAward, allAwards, type Award, type EarnInput, type Flag } from "@/lib/grit/earn";
import { settleBoss } from "@/lib/bosses/data";
import { refreshBank } from "@/lib/confidence/data";
import { createAdminClient } from "@/lib/supabase/server";

const WINDOW_DAYS = 21; // a new athlete starts with their last three weeks counted
const DAY = 86_400_000;

/**
 * Settle one athlete's grit. `asUser` (the athlete's own signed-in client) lets camp goals be checked
 * too, since the camp board is only readable by pod members; the cron run skips camps.
 */
export async function settleGrit(athleteId: string, asUser?: SupabaseClient, remeasure = false): Promise<number> {
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("timezone, health_pause").eq("id", athleteId).maybeSingle();
  if (!prof) return 0;
  const tz = prof.timezone || "America/Chicago";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
  const sinceDate = new Date(Date.parse(`${today}T12:00:00Z`) - WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const sinceIso = new Date(Date.now() - (WINDOW_DAYS + 1) * DAY).toISOString();

  const [{ data: acts }, { data: checks }, { data: ready }, { data: plans }, { data: changes }] = await Promise.all([
    admin.from("activities").select("id, start_time, duration_s, sport, training_load, planned_workout_id").eq("athlete_id", athleteId).gte("start_time", sinceIso).limit(500),
    admin.from("workout_checkins").select("activity_id, rpe, pain, created_at").eq("athlete_id", athleteId).gte("created_at", sinceIso).limit(500),
    admin.from("readiness_scores").select("date, overall, sleep").eq("athlete_id", athleteId).gte("date", sinceDate),
    admin.from("planned_workouts").select("id, scheduled_date, sport").eq("athlete_id", athleteId).is("deleted_at", null).in("status", ["approved", "sent", "completed"]).gte("scheduled_date", sinceDate).lte("scheduled_date", today),
    admin.from("plan_changes").select("id, created_at").eq("athlete_id", athleteId).eq("reason", "feeling_off").gte("created_at", sinceIso),
  ]);

  const pause = prof.health_pause as { since?: string } | null;
  const input: EarnInput = {
    tz,
    activities: (acts ?? []).map((a) => ({ ...a, training_load: a.training_load === null ? null : Number(a.training_load) })),
    checkins: (checks ?? []).map((c) => ({ ...c, pain: (c.pain ?? {}) as Record<string, number> })),
    readiness: Object.fromEntries((ready ?? []).map((r) => [r.date, { overall: r.overall as Flag, sleep: r.sleep as Flag }])),
    planned: (plans ?? []).map((p) => ({ id: p.id, date: p.scheduled_date, sport: p.sport })),
    pausedSince: typeof pause?.since === "string" ? pause.since : null,
    backedOff: (changes ?? []).map((c) => ({ id: c.id, date: new Date(c.created_at).toLocaleDateString("en-CA", { timeZone: tz }) })),
  };
  const awards: Award[] = allAwards(input);

  // Rest day quests ticked off (by the athlete, or by their watch / a recovery routine).
  const { data: quests } = await admin.from("quest_completions").select("date, quest_key, title, grit").eq("athlete_id", athleteId).gte("date", sinceDate);
  for (const q of quests ?? []) awards.push({ kind: "quest", ref: `${q.date}:${q.quest_key}`, amount: q.grit, reason: `Rest day quest: ${q.title}`.slice(0, 120), detail: { day: q.date } });

  if (asUser) {
    const { data: mine } = await admin.from("camp_members").select("camp_id, status, pod_camps(id, title, goal_value, ends_on)").eq("athlete_id", athleteId).in("status", ["joined", "left"]);
    for (const m of mine ?? []) {
      const camp = m.pod_camps as unknown as { id: string; title: string; goal_value: number; ends_on: string } | null;
      if (!camp || camp.ends_on >= today || camp.ends_on < sinceDate) continue;
      const { data: board } = await asUser.rpc("get_camp_board", { p_camp: camp.id });
      const b = (board ?? {}) as { total?: number; members?: { id: string; days: Record<string, { done: number }> }[] };
      const me = (b.members ?? []).find((x) => x.id === athleteId);
      const tookPart = Boolean(me && Object.values(me.days ?? {}).some((d) => d.done > 0));
      const a = campAward({ ...camp, goal_value: Number(camp.goal_value) }, Number(b.total ?? 0), tookPart, today);
      if (a) awards.push(a);
    }
  }

  // This month's boss: damage from finished sessions (defeat pays grit through the ledger itself).
  await settleBoss(admin, athleteId, remeasure).catch(() => null);
  // Once a day (cron): new proof moments for the confidence bank.
  if (remeasure) await refreshBank(admin, athleteId).catch(() => 0);

  if (!awards.length) return 0;
  const { data: added } = await admin
    .from("grit_ledger")
    .upsert(
      awards.map((a) => ({ athlete_id: athleteId, kind: a.kind, ref: a.ref, amount: a.amount, reason: a.reason, detail: a.detail ?? null })),
      { onConflict: "athlete_id,kind,ref", ignoreDuplicates: true },
    )
    .select("id");
  return added?.length ?? 0;
}

/** Morning cron: everyone (rules only), plus team challenge goals. */
export async function settleAllGrit(admin: SupabaseClient) {
  const { data: people } = await admin.from("profiles").select("id").eq("is_test", false);
  let added = 0;
  for (const p of people ?? []) added += await settleGrit(p.id, undefined, true).catch(() => 0);
  const { data: challenges } = await admin.rpc("grit_award_challenges");
  return { added, challenges: Number(challenges ?? 0) };
}
