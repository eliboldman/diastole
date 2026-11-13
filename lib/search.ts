"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

export type SearchHit = { kind: "action" | "athlete" | "workout" | "library" | "activity" | "pod" | "page"; title: string; sub: string | null; href: string };

/** Escape LIKE wildcards so a typed % or _ is matched literally. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const PAGES: { title: string; href: string; roles: ("coach" | "athlete" | "dietitian")[]; words: string }[] = [
  { title: "Team fueling", href: "/nutrition", roles: ["coach", "dietitian"], words: "nutrition dietitian fueling meals goals targets protein carbs" },
  { title: "Secrets", href: "/me/secrets", roles: ["coach", "athlete"], words: "secrets easter eggs hidden badges collection" },
  { title: "My setup: closet, gear, numbers, training days", href: "/me/setup", roles: ["coach", "athlete"], words: "closet shoes bikes gear trainer numbers ftp threshold pace heart rate zones week days schedule preferences setup" },
  { title: "Help and walkthrough videos", href: "/help", roles: ["coach", "athlete"], words: "help how to video tour walkthrough guide tutorial" },
  { title: "Today", href: "/dashboard", roles: ["coach"], words: "home flags readiness approvals suggestions" },
  { title: "Today", href: "/me", roles: ["athlete"], words: "home readiness" },
  { title: "The Endurance Lab", href: "/endurance-lab", roles: ["coach"], words: "build builder workout new form insights ai" },
  { title: "Workout library", href: "/library", roles: ["coach"], words: "library templates import garmin connect" },
  { title: "All workouts", href: "/workouts", roles: ["coach"], words: "planned scheduled bulk delete" },
  { title: "Calendar", href: "/calendar", roles: ["coach", "athlete"], words: "calendar month schedule" },
  { title: "Training", href: "/training", roles: ["athlete"], words: "workouts activities runs" },
  { title: "Pods", href: "/pods", roles: ["coach"], words: "groups teams" },
  { title: "Weekly digest", href: "/digest", roles: ["coach"], words: "summary week report compliance missed" },
  { title: "My pods", href: "/me/pods", roles: ["athlete"], words: "groups teams sharing" },
  { title: "Me", href: "/account", roles: ["coach", "athlete"], words: "profile avatar readiness form recovery hrv sleep metrics prs" },
  { title: "Weather location", href: "/account/settings#weather", roles: ["coach", "athlete"], words: "weather forecast town city location rain heat cold" },
  { title: "Appearance", href: "/account/settings#appearance", roles: ["coach", "athlete"], words: "theme color colour dark black oled background text size font bigger corners compact spacing animations motion custom" },
  { title: "Settings", href: "/account/settings", roles: ["coach", "athlete"], words: "account settings units timezone name device notifications theme pods sharing sign out" },
  { title: "Watch connection", href: "/connect", roles: ["coach", "athlete"], words: "garmin apple device watch connect" },
  { title: "Import Garmin history", href: "/me/import", roles: ["coach", "athlete"], words: "export zip history backfill" },
  { title: "Notifications", href: "/notifications", roles: ["coach", "athlete"], words: "bell alerts inbox updates" },
  { title: "Upload a workout file", href: "/me/upload", roles: ["coach", "athlete"], words: "fit file rouvy zwift trainerroad upload ride" },
  { title: "Garmin deliveries", href: "/garmin-log", roles: ["coach"], words: "webhook log sync" },
  { title: "AI test mode", href: "/lab", roles: ["coach"], words: "test lab fake athletes" },
  { title: "Approvals", href: "/inbox", roles: ["coach"], words: "approve approvals inbox waiting pending bosses suggestions episodes requests briefs" },
  { title: "Compare athletes", href: "/compare", roles: ["coach"], words: "compare side by side versus vs two athletes" },
  { title: "Download my data", href: "/account/settings#data", roles: ["coach", "athlete"], words: "export download csv data spreadsheet" },
  { title: "Grit bank and store", href: "/me/grit", roles: ["coach", "athlete"], words: "grit store shop stickers jerseys helmets auras themes" },
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

  hits.push(...(await actions(supabase, me, q)));

  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (me.role === "dietitian") {
    // A team dietitian: the team's athletes, opening on their nutrition review.
    const { data } = me.team_coach_id
      ? await supabase.from("profiles").select("id, full_name, email").eq("coach_id", me.team_coach_id).eq("is_test", false).or(`full_name.ilike.${pat},email.ilike.${pat}`).limit(8)
      : { data: [] };
    for (const a of data ?? []) hits.push({ kind: "athlete", title: a.full_name || a.email || "Athlete", sub: "Nutrition", href: `/nutrition/${a.id}` });
  } else if (me.role === "coach") {
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

/**
 * Typed commands: "log oatmeal", "message Walker", "move Thursday", "new workout", "sick".
 * They become the first results and open the right screen, ready to go.
 */
async function actions(supabase: Awaited<ReturnType<typeof createClient>>, me: Awaited<ReturnType<typeof requireUser>>, q: string): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  const log = q.match(/^(?:log|ate|had)\s+(.{2,})$/i);
  if (log && me.role !== "dietitian") out.push({ kind: "action", title: `Log “${log[1]}”`, sub: "Opens the meal logger with this filled in", href: `/fuel?log=1&via=describe#t=${encodeURIComponent(log[1])}` });

  const msg = q.match(/^(?:message|msg|text|dm|chat)\s+(.{2,})$/i);
  if (msg) {
    const name = msg[1].trim();
    const pat = `%${name.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const people =
      me.role === "athlete"
        ? [
            ...((await supabase.rpc("my_dietitians")).data ?? []).map((d: { id: string; full_name: string }) => ({ id: d.id, name: d.full_name })),
            ...(me.coach_id ? [{ id: me.coach_id, name: "My coach" }] : []),
          ].filter((p) => (p.name !== "My coach" && p.name.toLowerCase().includes(name.toLowerCase())) || (p.name === "My coach" && /coach/i.test(name)))
        : ((await supabase.from("profiles").select("id, full_name").eq(me.role === "dietitian" ? "coach_id" : "coach_id", me.role === "dietitian" ? me.team_coach_id ?? "" : me.id).neq("id", me.id).ilike("full_name", pat).limit(4)).data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Athlete" }));
    for (const p of people.slice(0, 4)) out.push({ kind: "action", title: `Message ${p.name}`, sub: "Opens your chat", href: `/messages/start?to=${p.id}` });
  }

  if (/^(move|reschedule|swap|skip|can'?t|cannot|missed?)\b/i.test(q)) {
    out.push(
      me.role === "coach"
        ? { kind: "action", title: "Change an athlete's plan", sub: "Open the athlete, then “Change of plans”, or drag on the team calendar", href: "/calendar" }
        : { kind: "action", title: "Change a workout", sub: "Open it and tap “Life happened” to move, shorten or skip it", href: "/training" },
    );
  }
  if (/^(sick|ill|injur|hurt)/i.test(q) && me.role !== "dietitian") out.push({ kind: "action", title: "I'm sick or injured", sub: "Pauses your plan and tells your coach", href: "/me#life" });
  if (/^(new|build|create)\s+(workout|session)/i.test(q) && me.role === "coach") out.push({ kind: "action", title: "Build a new workout", sub: "The Endurance Lab", href: "/endurance-lab" });
  if (/^(new|build|create)\s+(workout|session)/i.test(q) && me.role === "athlete") out.push({ kind: "action", title: "Build my own workout", sub: "My workouts", href: "/training/mine/new" });
  if (/^(check ?in|how.*feel)/i.test(q) && me.role !== "dietitian") out.push({ kind: "action", title: "Check in on my last workout", sub: "How it felt, effort, sore spots", href: "/training" });
  return out;
}
