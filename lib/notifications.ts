"use server";

import { createClient, requireUser } from "@/lib/supabase/server";

export type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const UUID = /^[0-9a-f-]{36}$/i;
const COLUMNS = "id, kind, title, body, href, meta, read_at, created_at";

/** Newest first. `before` (an ISO time) pages back. */
export async function listNotifications(limit = 20, before?: string): Promise<{ items: Notice[]; unread: number }> {
  const me = await requireUser();
  const supabase = await createClient();
  let q = supabase.from("notifications").select(COLUMNS).eq("user_id", me.id).order("created_at", { ascending: false }).limit(Math.min(100, Math.max(1, limit)));
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  const [{ data }, { count }] = await Promise.all([
    q,
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).is("read_at", null),
  ]);
  return { items: (data ?? []) as Notice[], unread: count ?? 0 };
}

export async function unreadCount(): Promise<number> {
  const me = await requireUser();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", me.id).is("read_at", null);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  if (!UUID.test(id)) return;
  const me = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", me.id).is("read_at", null);
}

export async function markAllRead(): Promise<void> {
  const me = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null);
}
