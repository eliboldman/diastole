import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Everything waiting on the coach, from every feature, newest first. Row-level security keeps it
// to this coach's athletes and pods.
export type InboxType = "suggestion" | "boss" | "plan_change" | "request" | "strength" | "brief" | "episode";
export type InboxItem = { type: InboxType; id: string; who: string; title: string; detail: string | null; body?: string; at: string; href: string; extra?: Record<string, string> };

const LIMITER: Record<string, string> = { fade: "late-race fade", climbing: "climbing", swim: "swim", consistency: "consistency" };

export async function getInbox(supabase: SupabaseClient, coachId: string): Promise<InboxItem[]> {
  const [sug, boss, plan, req, str, brief, ep, roster] = await Promise.all([
    supabase.from("ai_suggestions").select("id, athlete_id, summary, rationale, action, created_at").eq("coach_id", coachId).eq("status", "pending").order("created_at", { ascending: false }).limit(30),
    supabase.from("bosses").select("id, athlete_id, limiter, evidence, created_at").eq("coach_id", coachId).eq("status", "suggested").limit(30),
    supabase.from("plan_changes").select("id, athlete_id, summary, why, created_at").eq("coach_id", coachId).eq("status", "pending").limit(30),
    supabase.from("planned_workouts").select("id, athlete_id, title, scheduled_date, sport, created_at").eq("coach_id", coachId).eq("status", "draft").not("requested_by", "is", null).is("declined_at", null).is("deleted_at", null).limit(30),
    supabase.from("strength_suggestions").select("id, athlete_id, changes, created_at").eq("status", "pending").limit(30),
    supabase.from("morning_briefs").select("id, athlete_id, draft, date, created_at").eq("coach_id", coachId).eq("status", "pending").order("date", { ascending: false }).limit(30),
    supabase.from("storylines").select("id, pod_id, title, body, episode, created_at, pods(name)").eq("coach_id", coachId).eq("status", "draft").limit(10),
    supabase.from("profiles").select("id, full_name").eq("coach_id", coachId),
  ]);
  const names = new Map((roster.data ?? []).map((p) => [p.id, (p.full_name ?? "").trim() || "Athlete"]));
  const who = (id: string) => names.get(id) ?? "Athlete";
  const items: InboxItem[] = [];
  for (const s of sug.data ?? []) items.push({ type: "suggestion", id: s.id, who: who(s.athlete_id), title: s.summary, detail: s.rationale, at: s.created_at, href: `/dashboard#suggestions` });
  for (const b of boss.data ?? []) items.push({ type: "boss", id: b.id, who: who(b.athlete_id), title: `Boss this month: ${LIMITER[b.limiter] ?? b.limiter}`, detail: b.evidence, at: b.created_at, href: `/athlete/${b.athlete_id}#boss` });
  for (const p of plan.data ?? []) items.push({ type: "plan_change", id: p.id, who: who(p.athlete_id), title: p.summary, detail: p.why, at: p.created_at, href: `/athlete/${p.athlete_id}` });
  for (const r of req.data ?? []) items.push({ type: "request", id: r.id, who: who(r.athlete_id), title: `Asked to add: ${r.title}`, detail: `${r.sport} · ${new Date(`${r.scheduled_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}`, at: r.created_at, href: `/athlete/${r.athlete_id}/workouts/${r.id}` });
  for (const s of str.data ?? []) {
    if (!names.has(s.athlete_id)) continue;
    const ch = (s.changes as { slug: string; why?: string }[]) ?? [];
    items.push({ type: "strength", id: s.id, who: who(s.athlete_id), title: `Strength progression: ${ch.length} change${ch.length === 1 ? "" : "s"}`, detail: ch.map((c) => c.why ?? c.slug).slice(0, 3).join(" · ") || null, at: s.created_at, href: `/athlete/${s.athlete_id}` });
  }
  for (const b of brief.data ?? []) items.push({ type: "brief", id: b.id, who: who(b.athlete_id), title: "Morning message draft", detail: null, body: b.draft, at: b.created_at, href: `/dashboard#briefs` });
  for (const e of ep.data ?? []) {
    const pod = (e.pods as unknown as { name: string } | null)?.name ?? "Pod";
    items.push({ type: "episode", id: e.id, who: pod, title: `Episode ${e.episode}: ${e.title}`, detail: null, body: e.body, at: e.created_at, href: `/pods/${e.pod_id}`, extra: { title: e.title } });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Just the number, for badges. */
export async function inboxCount(supabase: SupabaseClient, coachId: string): Promise<number> {
  return (await getInbox(supabase, coachId)).length;
}
