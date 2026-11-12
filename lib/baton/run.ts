// Moves each pod's baton along from real workouts (server only). Safe to run often: passes are keyed
// to the workout that made them, and nudges and milestones only fire once.
import type { SupabaseClient } from "@supabase/supabase-js";

import { advance, milestoneGrit, milestonesCrossed, type BatonState } from "@/lib/baton/baton";
import { isRestDay } from "@/lib/quests/quests";

const DAY = 86_400_000;
const localDay = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

export async function processBaton(admin: SupabaseClient, podId: string) {
  const { data: members } = await admin.from("pod_members").select("athlete_id, invited_at, profiles(full_name, timezone, health_pause)").eq("pod_id", podId).eq("status", "active").eq("baton", true).order("invited_at");
  const rows = (members ?? []).map((m) => ({ id: m.athlete_id as string, p: m.profiles as unknown as { full_name: string | null; timezone: string | null; health_pause: unknown } | null }));
  const order = rows.map((r) => r.id);
  const { data: row } = await admin.from("pod_batons").select("holder_id, since, handoffs, chain, longest, nudged_at").eq("pod_id", podId).maybeSingle();
  if (order.length < 2 && !row) return;
  const before: BatonState = row
    ? { holder: row.holder_id, since: row.since, handoffs: row.handoffs, chain: row.chain, longest: row.longest, nudged_at: row.nudged_at }
    : { holder: null, since: null, handoffs: 0, chain: 0, longest: 0, nudged_at: null };
  const now = new Date().toISOString();
  const from = before.since ?? new Date(Date.now() - DAY).toISOString();

  // Workout end times since the baton last moved (10+ minute sessions).
  const { data: acts } = order.length
    ? await admin.from("activities").select("id, athlete_id, start_time, duration_s").in("athlete_id", order).gte("start_time", new Date(Date.parse(from) - DAY).toISOString()).gte("duration_s", 600).order("start_time").limit(500)
    : { data: [] };
  const finishes: Record<string, { at: string; activity: string }[]> = {};
  for (const a of acts ?? []) {
    const at = new Date(Date.parse(a.start_time) + (a.duration_s ?? 0) * 1000).toISOString();
    (finishes[a.athlete_id] ??= []).push({ at, activity: a.id });
  }
  for (const k of Object.keys(finishes)) finishes[k].sort((x, y) => x.at.localeCompare(y.at));

  // Who's resting today, in their own time zone: nothing planned (with a plan around it), sick or
  // injured, or a "life happened" today.
  const resting = new Set<string>();
  if (order.length) {
    const [{ data: plans }, { data: changes }] = await Promise.all([
      admin.from("planned_workouts").select("athlete_id, scheduled_date").in("athlete_id", order).is("deleted_at", null).in("status", ["approved", "sent", "completed"]).gte("scheduled_date", new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10)).lte("scheduled_date", new Date(Date.now() + 8 * DAY).toISOString().slice(0, 10)),
      admin.from("plan_changes").select("athlete_id, created_at").in("athlete_id", order).in("reason", ["cant_today", "feeling_off", "missed"]).gte("created_at", new Date(Date.now() - 2 * DAY).toISOString()),
    ]);
    for (const r of rows) {
      const tz = r.p?.timezone || "America/Chicago";
      const today = localDay(now, tz);
      const mine = (plans ?? []).filter((p) => p.athlete_id === r.id);
      const rest = isRestDay({ plannedToday: mine.filter((p) => p.scheduled_date === today).length, plannedNearby: mine.length, paused: false });
      const lifeHappened = (changes ?? []).some((c) => c.athlete_id === r.id && localDay(c.created_at, tz) === today);
      if (rest || Boolean(r.p?.health_pause) || lifeHappened) resting.add(r.id);
    }
  }

  const { state, events, nudge } = advance(before, { order, finishes, resting, now });
  if (!events.length && !nudge && row) return;

  if (events.length)
    await admin.from("baton_passes").upsert(
      events.map((e) => ({ pod_id: podId, from_id: e.from, to_id: e.to, kind: e.kind, activity_id: e.activity ?? null, passed_at: e.at })),
      { onConflict: "pod_id,activity_id", ignoreDuplicates: true },
    );
  await admin.from("pod_batons").upsert({ pod_id: podId, holder_id: state.holder, since: state.since, handoffs: state.handoffs, chain: state.chain, longest: state.longest, nudged_at: state.nudged_at, updated_at: now });

  const first = (id: string | null) => (rows.find((r) => r.id === id)?.p?.full_name || "a pod mate").split(" ")[0];
  if (nudge && state.holder) {
    // Gentle, and only to the people playing.
    for (const id of order)
      await admin.rpc("server_notify", {
        p_user: id,
        p_kind: "baton",
        p_title: id === state.holder ? "The baton's with you 🪶" : `The baton's resting with ${first(state.holder)}`,
        p_body: id === state.holder ? "No rush. Your next workout sends it on." : "Send some props their way?",
        p_href: `/me/pods/${podId}`,
        p_key: `baton_nudge:${podId}:${state.since}`,
      });
  }
  for (const m of milestonesCrossed(before, state)) {
    const grit = milestoneGrit(m.kind, m.n);
    const label = m.kind === "handoffs" ? `${m.n} baton handoffs` : `${m.n}-handoff baton chain`;
    await admin.from("grit_ledger").upsert(order.map((id) => ({ athlete_id: id, kind: "baton", ref: `${podId}:${m.kind}:${m.n}`, amount: grit, reason: `Pod milestone: ${label}`, detail: { day: now.slice(0, 10) } })), { onConflict: "athlete_id,kind,ref", ignoreDuplicates: true });
    for (const id of order) await admin.rpc("server_notify", { p_user: id, p_kind: "baton", p_title: `🎉 ${label}!`, p_body: `Everyone who carried it earns ${grit} grit.`, p_href: `/me/pods/${podId}`, p_key: `baton_ms:${podId}:${m.kind}:${m.n}` });
  }
}

/** Crons: every pod with a baton (or two opted-in members). */
export async function processAllBatons(admin: SupabaseClient) {
  const { data } = await admin.from("pod_members").select("pod_id").eq("baton", true).eq("status", "active");
  const pods = [...new Set((data ?? []).map((d) => d.pod_id as string))];
  for (const p of pods) await processBaton(admin, p).catch(() => null);
  return { pods: pods.length };
}
