import type { SupabaseClient } from "@supabase/supabase-js";

export type Camp = { id: string; pod_id: string; title: string; blurb: string | null; starts_on: string; ends_on: string; goal_metric: "sessions" | "hours" | "distance"; goal_value: number };
export type BoardMember = { id: string; name: string; in: boolean; days: Record<string, { planned: number; done: number }> };
export type Board = { members: BoardMember[]; total: number };
export type MyStatus = "joined" | "declined" | "left" | null;

const CAMP_COLS = "id, pod_id, title, blurb, starts_on, ends_on, goal_metric, goal_value";
const DAY = 86_400_000;
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const dayNumber = (camp: Camp, today: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${camp.starts_on}T12:00:00Z`)) / DAY) + 1;
export const campLength = (camp: Camp) => dayNumber(camp, camp.ends_on);
export const phaseOf = (camp: Camp, today: string): "upcoming" | "live" | "done" => (today < camp.starts_on ? "upcoming" : today > camp.ends_on ? "done" : "live");

export async function getBoard(supabase: SupabaseClient, campId: string): Promise<Board> {
  const { data } = await supabase.rpc("get_camp_board", { p_camp: campId });
  const b = (data ?? { members: [], total: 0 }) as Board;
  return { members: b.members ?? [], total: Number(b.total ?? 0) };
}

/** A pod's camps (recent and upcoming) with the viewer's own status. */
export async function getPodCamps(supabase: SupabaseClient, podId: string, meId: string, today: string) {
  const { data: camps } = await supabase.from("pod_camps").select(CAMP_COLS).eq("pod_id", podId).gte("ends_on", addDays(today, -30)).order("starts_on");
  const ids = (camps ?? []).map((c) => c.id);
  const { data: mine } = ids.length ? await supabase.from("camp_members").select("camp_id, status").eq("athlete_id", meId).in("camp_id", ids) : { data: [] };
  return ((camps ?? []) as Camp[]).map((c) => ({ camp: c, status: ((mine ?? []).find((m) => m.camp_id === c.id)?.status ?? null) as MyStatus }));
}

/** Camps for the athlete's Today card: in their active pods, starting within two weeks or ended within three days. */
export async function getMyCamps(supabase: SupabaseClient, meId: string, today: string) {
  const { data: pods } = await supabase.from("pod_members").select("pod_id").eq("athlete_id", meId).eq("status", "active");
  const podIds = (pods ?? []).map((p) => p.pod_id as string);
  if (!podIds.length) return [];
  const { data: camps } = await supabase.from("pod_camps").select(CAMP_COLS).in("pod_id", podIds).gte("ends_on", addDays(today, -3)).lte("starts_on", addDays(today, 14)).order("starts_on").limit(3);
  if (!camps?.length) return [];
  const { data: mine } = await supabase.from("camp_members").select("camp_id, status, application_id").eq("athlete_id", meId).in("camp_id", camps.map((c) => c.id));
  return Promise.all(
    (camps as Camp[]).map(async (camp) => {
      const m = (mine ?? []).find((x) => x.camp_id === camp.id);
      const status = (m?.status ?? null) as MyStatus;
      const [board, { data: todays }] = await Promise.all([
        getBoard(supabase, camp.id),
        m?.application_id && status === "joined" ? supabase.from("planned_workouts").select("id, title, status").eq("plan_application_id", m.application_id).eq("scheduled_date", today).is("deleted_at", null) : Promise.resolve({ data: [] }),
      ]);
      return { camp, status, board, today: (todays ?? []) as { id: string; title: string; status: string }[] };
    }),
  );
}

export async function getCamp(supabase: SupabaseClient, campId: string) {
  const { data } = await supabase.from("pod_camps").select(CAMP_COLS).eq("id", campId).maybeSingle();
  return (data ?? null) as Camp | null;
}

export async function getMessages(supabase: SupabaseClient, campId: string) {
  const { data } = await supabase.from("camp_messages").select("date, body").eq("camp_id", campId).order("date", { ascending: false });
  return (data ?? []) as { date: string; body: string }[];
}

/** The athlete's own recap: sessions done of planned, and the badge it earns. */
export function recapFor(board: Board, meId: string) {
  const me = board.members.find((m) => m.id === meId);
  const days = Object.values(me?.days ?? {});
  const planned = days.reduce((a, d) => a + d.planned, 0);
  const done = days.reduce((a, d) => a + d.done, 0);
  const pct = planned ? done / planned : 0;
  const badge = pct >= 0.8 ? { key: "finisher", label: "Camp finisher" } : done >= 1 ? { key: "showed-up", label: "Showed up" } : null;
  return { planned, done, badge };
}
