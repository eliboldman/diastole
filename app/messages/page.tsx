import { ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import InboxLive from "@/components/messages/InboxLive";
import type { InboxRow } from "@/lib/messages/types";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages · Diastole" };

function when(iso: string | null, timeZone: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  if (day(d) === day(new Date())) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  if (Date.now() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("en-US", { weekday: "short", timeZone });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}

function preview(r: InboxRow) {
  const l = r.last;
  if (!l) return "No messages yet";
  const text = l.deleted ? "Message deleted" : l.body ?? (l.media_kind === "photo" ? "📷 Photo" : l.media_kind === "voice" ? "🎤 Voice note" : "");
  const who = l.from_me ? "You: " : r.kind === "pod" ? `${l.sender}: ` : "";
  return `${who}${text}`;
}

type Contact = { key: string; href: string; title: string; subtitle: string; pod: boolean };

export default async function MessagesPage() {
  const me = await requireUser();
  const coach = me.role === "coach";
  const supabase = await createClient();

  const [{ data: inbox }, people, pods] = await Promise.all([
    supabase.rpc("get_inbox"),
    coach
      ? supabase.from("profiles").select("id, full_name, email").eq("coach_id", me.id).neq("id", me.id).eq("is_test", false).order("full_name")
      : me.coach_id
        ? supabase.from("profiles").select("id, full_name, email").eq("id", me.coach_id)
        : Promise.resolve({ data: [] }),
    coach
      ? supabase.from("pods").select("id, name").eq("coach_id", me.id).order("name")
      : supabase.from("pod_members").select("pods(id, name)").eq("athlete_id", me.id).eq("status", "active"),
  ]);
  const rows = (inbox ?? []) as InboxRow[];
  const active = rows.filter((r) => r.last);

  // Everyone you can message who doesn't have a thread with messages yet.
  const talked = new Set(active.flatMap((r) => [r.other_id, r.pod_id]).filter(Boolean));
  const podList = (pods.data ?? []).flatMap((p) => {
    const x = "pods" in p ? (p.pods as unknown as { id: string; name: string } | null) : (p as { id: string; name: string });
    return x ? [x] : [];
  });
  const contacts: Contact[] = [
    ...(people.data ?? [])
      .filter((p) => !talked.has(p.id))
      .map((p) => ({
        key: p.id,
        href: `/messages/start?to=${p.id}`,
        title: p.full_name || p.email?.split("@")[0] || "Athlete",
        subtitle: coach ? "Athlete" : "Your coach",
        pod: false,
      })),
    ...podList.filter((p) => !talked.has(p.id)).map((p) => ({ key: p.id, href: `/messages/start?pod=${p.id}`, title: p.name, subtitle: "Pod chat", pod: true })),
  ];

  return (
    <DashboardShell role={coach ? "coach" : "athlete"}>
      <InboxLive />
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">Messages</h1>

        {active.length > 0 ? (
          <ul className="stagger mt-6 grid gap-2">
            {active.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/messages/${r.id}`}
                  className={`flex items-center gap-3 rounded-[24px] border p-3 pr-4 backdrop-blur-xl transition hover:bg-white/[0.08] ${
                    r.unread ? "border-emerald-300/25 bg-emerald-300/[0.06]" : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300/30 to-sky-300/20 font-semibold text-emerald-50 ring-1 ring-white/10">
                    {r.kind === "pod" ? <Users size={19} aria-hidden /> : r.title.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`truncate ${r.unread ? "font-semibold" : "font-medium"}`}>{r.title}</span>
                      <span className={`shrink-0 text-xs ${r.unread ? "text-emerald-200" : "text-white/40"}`}>{when(r.last_message_at, me.timezone)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-3">
                      <span className={`truncate text-sm ${r.unread ? "text-white/85" : "text-white/50"}`}>{preview(r)}</span>
                      {r.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-300 px-1.5 text-[11px] font-semibold text-black">
                          {r.unread > 99 ? "99+" : r.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-white/55">
            {coach ? "No conversations yet. Start one with an athlete or a pod below." : "No messages yet. Say hi to your coach below."}
          </p>
        )}

        {contacts.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-[11px] uppercase tracking-[0.2em] text-white/45">Start a conversation</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.key}>
                  <Link href={c.href} className="flex min-h-14 items-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-3 transition hover:bg-white/[0.07]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm text-white/80">
                      {c.pod ? <Users size={16} aria-hidden /> : c.title.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.title}</span>
                      <span className="block truncate text-xs text-white/45">{c.subtitle}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-white/35" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
