// Reading a pod's campfire (server). Media comes back as short-lived signed links.
import type { SupabaseClient } from "@supabase/supabase-js";

import { fireWindow, lastWeek, type FireWindow } from "@/lib/campfire/campfire";
import { createAdminClient } from "@/lib/supabase/server";

export type CampLog = {
  id: string;
  author_id: string;
  is_coach: boolean;
  highlight: string | null;
  struggle: string | null;
  h: { kind: "voice" | "photo"; url: string } | null;
  s: { kind: "voice" | "photo"; url: string } | null;
};
export type CampView = { window: FireWindow; podTz: string; logs: CampLog[]; last: { week: string; logs: CampLog[] } | null };

export async function podTimeZone(admin: SupabaseClient, podId: string) {
  const { data } = await admin.from("pods").select("coach_id, profiles!pods_coach_id_fkey(timezone)").eq("id", podId).maybeSingle();
  return ((data?.profiles as unknown as { timezone: string | null } | null)?.timezone || "America/Chicago") as string;
}

async function logsFor(supabase: SupabaseClient, podId: string, week: string): Promise<CampLog[]> {
  const { data: fire } = await supabase.from("campfires").select("id").eq("pod_id", podId).eq("week", week).maybeSingle();
  if (!fire) return [];
  const { data } = await supabase.from("campfire_logs").select("id, author_id, is_coach, highlight, struggle, h_media, h_kind, s_media, s_kind").eq("campfire_id", fire.id).order("created_at");
  const rows = data ?? [];
  const paths = rows.flatMap((r) => [r.h_media, r.s_media]).filter((p): p is string => Boolean(p));
  const { data: signed } = paths.length ? await createAdminClient().storage.from("campfire").createSignedUrls(paths, 3600) : { data: [] };
  const url = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl]));
  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    is_coach: r.is_coach,
    highlight: r.highlight,
    struggle: r.struggle,
    h: r.h_media && url.get(r.h_media) ? { kind: r.h_kind as "voice" | "photo", url: url.get(r.h_media)! } : null,
    s: r.s_media && url.get(r.s_media) ? { kind: r.s_kind as "voice" | "photo", url: url.get(r.s_media)! } : null,
  }));
}

/** This week's campfire (when lit) and last week's (to look back on). Caller's client: pod members only. */
export async function getCampfire(supabase: SupabaseClient, podId: string): Promise<CampView> {
  const tz = await podTimeZone(createAdminClient(), podId);
  const now = new Date();
  const w = fireWindow(now, tz);
  const prev = lastWeek(now, tz);
  const [logs, last] = await Promise.all([w.open ? logsFor(supabase, podId, w.week) : Promise.resolve([]), logsFor(supabase, podId, prev)]);
  return { window: w, podTz: tz, logs, last: last.length ? { week: prev, logs: last } : null };
}

/** Evening cron: tell each pod its campfire is lit (once per Sunday). */
export async function lightCampfires(admin: SupabaseClient) {
  const { fireWindow } = await import("@/lib/campfire/campfire");
  const { data: pods } = await admin.from("pods").select("id, name, coach_id, profiles!pods_coach_id_fkey(timezone)");
  let lit = 0;
  for (const p of pods ?? []) {
    const tz = (p.profiles as unknown as { timezone: string | null } | null)?.timezone || "America/Chicago";
    const w = fireWindow(new Date(), tz);
    if (!w.open) continue;
    const { data: members } = await admin.from("pod_members").select("athlete_id").eq("pod_id", p.id).eq("status", "active");
    if (!members?.length) continue;
    for (const id of [...members.map((m) => m.athlete_id as string), p.coach_id as string])
      await admin.rpc("server_notify", { p_user: id, p_kind: "campfire", p_title: `🔥 The ${p.name} campfire is lit`, p_body: "Pull up a log: one highlight and one struggle from your week.", p_href: id === p.coach_id ? `/pods/${p.id}` : `/me/pods/${p.id}`, p_key: `campfire:${p.id}:${w.week}` });
    lit++;
  }
  return { lit };
}
