"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

export type SearchHit = { kind: "athlete" | "workout" | "library" | "activity" | "pod" | "page"; title: string; sub: string | null; href: string };

/** Escape LIKE wildcards so a typed % or _ is matched literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const PAGES: { title: string; href: string; roles: ("coach" | "athlete")[]; words: string }[] = [
  { title: "Today", href: "/dashboard", roles: ["coach"], words: "home flags readiness approvals suggestions" },
  { title: "Today", href: "/me", roles: ["athlete"], words: "home readiness" },
  { title: "The Endurance Lab", href: "/endurance-lab", roles: ["coach"], words: "build builder workout new form insights ai" },
  { title: "Workout library", href: "/library", roles: ["coach"], words: "library templates import garmin connect" },
  { title: "All workouts", href: "/workouts", roles: ["coach"], words: "planned scheduled bulk delete" },
  { title: "Calendar", href: "/calendar", roles: ["coach", "athlete"], words: "calendar month schedule" },
  { title: "Training", href: "/training", roles: ["athlete"], words: "workouts activities runs" },
  { title: "Pods", href: "/pods", roles: ["coach"], words: "groups teams" },
  { title: "My pods", href: "/me/pods", roles: ["athlete"], words: "groups teams sharing" },
  { title: "Me", href: "/account", roles: ["coach", "athlete"], words: "account settings profile units timezone name device sign out" },
  { title: "Watch connection", href: "/connect", roles: ["coach", "athlete"], words: "garmin apple device watch connect" },
  { title: "Import Garmin history", href: "/me/import", roles: ["coach", "athlete"], words: "export zip history backfill" },
  { title: "Garmin deliveries", href: "/garmin-log", roles: ["coach"], words: "webhook log sync" },
  { title: "AI test mode", href: "/lab", roles: ["coach"], words: "test lab fake athletes" },
];

/** Search what the signed-in person can see. Row-level security scopes every query. */
export async function search(raw: string): Promise<SearchHit[]> {
  const me = await requireUser();
  // Commas and brackets would break PostgREST's or() filter syntax; they never matter for names.
  const q = raw.replace(/[,()]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const pat = like(q);
  const lower = q.toLowerCase();
  const hits: SearchHit[] = [];

  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (me.role === "coach") {
    const [athletes, workouts, library, pods, acts] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("coach_id", me.id).eq("is_test", false).or(`full_name.ilike.${pat},email.ilike.${pat}`).limit(6),
      supabase
        .from("planned_workouts")
        .select("id, athlete_id, title, scheduled_date, sport, profiles!planned_workouts_athlete_id_fkey(full_name)")
        .eq("coach_id", me.id)
        .is("deleted_at", null)
        .ilike("title", pat)
        .order("scheduled_date", { ascending: false })
        .limit(6),
      supabase.from("workout_library").select("id, title, sport, workout_type").eq("coach_id", me.id).ilike("title", pat).limit(6),
      supabase.from("pods").select("id, name").eq("coach_id", me.id).ilike("name", pat).limit(4),
      supabase.from("activities").select("id, name, sport, start_time, profiles!activities_athlete_id_fkey(full_name)").ilike("name", pat).order("start_time", { ascending: false }).limit(5),
    ]);
    for (const a of athletes.data ?? []) hits.push({ kind: "athlete", title: a.full_name || a.email || "Athlete", sub: a.id === me.id ? "You" : "Athlete", href: `/athlete/${a.id}` });
    for (const w of workouts.data ?? []) {
      const who = (w.profiles as unknown as { full_name: string | null } | null)?.full_name;
      hits.push({ kind: "workout", title: w.title, sub: [who, day(w.scheduled_date), w.sport].filter(Boolean).join(" · "), href: `/athlete/${w.athlete_id}/workouts/${w.id}` });
    }
    for (const l of library.data ?? []) hits.push({ kind: "library", title: l.title, sub: `Library · ${l.sport} · ${l.workout_type}`, href: `/library?q=${encodeURIComponent(l.title)}` });
    for (const p of pods.data ?? []) hits.push({ kind: "pod", title: p.name, sub: "Pod", href: `/pods/${p.id}` });
    for (const a of acts.data ?? []) {
      const who = (a.profiles as unknown as { full_name: string | null } | null)?.full_name;
      hits.push({ kind: "activity", title: a.name || a.sport || "Activity", sub: [who, day(a.start_time.slice(0, 10))].filter(Boolean).join(" · "), href: `/activity/${a.id}` });
    }
  } else {
    const [workouts, acts, pods] = await Promise.all([
      supabase.from("planned_workouts").select("id, title, scheduled_date, sport").eq("athlete_id", me.id).is("deleted_at", null).ilike("title", pat).order("scheduled_date", { ascending: false }).limit(8),
      supabase.from("activities").select("id, name, sport, start_time").eq("athlete_id", me.id).or(`name.ilike.${pat},sport.ilike.${pat}`).order("start_time", { ascending: false }).limit(8),
      supabase.from("pod_members").select("pod_id, pods(name)").eq("athlete_id", me.id).eq("status", "active"),
    ]);
    for (const w of workouts.data ?? []) hits.push({ kind: "workout", title: w.title, sub: [day(w.scheduled_date), w.sport].join(" · "), href: `/training/workouts/${w.id}` });
    for (const a of acts.data ?? []) hits.push({ kind: "activity", title: a.name || a.sport || "Activity", sub: day(a.start_time.slice(0, 10)), href: `/activity/${a.id}` });
    for (const p of pods.data ?? []) {
      const name = (p.pods as unknown as { name: string } | null)?.name ?? "";
      if (name.toLowerCase().includes(lower)) hits.push({ kind: "pod", title: name, sub: "Pod", href: `/me/pods/${p.pod_id}` });
    }
  }

  for (const p of PAGES) {
    if (!p.roles.includes(me.role)) continue;
    if (p.title.toLowerCase().includes(lower) || p.words.includes(lower)) hits.push({ kind: "page", title: p.title, sub: "Page", href: p.href });
  }
  return hits.slice(0, 30);
}
