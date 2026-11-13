import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AvatarCircle from "@/components/avatar/AvatarCircle";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import Thread from "@/components/messages/Thread";
import { loadRefs } from "@/lib/messages/refs";
import { MESSAGE_COLUMNS, PAGE, type ConversationInfo, type Message } from "@/lib/messages/types";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages · Diastole" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ activity?: string; workout?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  if (!UUID.test(id)) notFound();
  const me = await requireUser();
  const supabase = await createClient();

  const [{ data: info }, { data: latest }] = await Promise.all([
    supabase.rpc("get_conversation", { p_conv: id }),
    supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id).order("created_at", { ascending: false }).limit(PAGE),
  ]);
  if (!info) notFound();
  const conv = info as ConversationInfo;
  const messages = ((latest ?? []) as Message[]).reverse();

  const attachAct = q.activity && UUID.test(q.activity) ? q.activity : null;
  const attachPlan = !attachAct && q.workout && UUID.test(q.workout) ? q.workout : null;
  const refs = await loadRefs(
    supabase,
    [...new Set([...messages.flatMap((m) => (m.activity_id ? [m.activity_id] : [])), ...(attachAct ? [attachAct] : [])])],
    [...new Set([...messages.flatMap((m) => (m.planned_workout_id ? [m.planned_workout_id] : [])), ...(attachPlan ? [attachPlan] : [])])],
    me.timezone,
  );
  const attach = (attachAct && refs[attachAct]) || (attachPlan && refs[attachPlan]) || null;
  const { data: avatars } = await supabase.rpc("get_avatars", { p_ids: conv.people.map((p) => p.id) });
  const looks = (avatars ?? {}) as Record<string, unknown>;

  const other = conv.people.find((p) => !p.is_me && conv.kind !== "pod");
  const subtitle =
    conv.kind === "pod"
      ? `Pod chat · ${conv.people.length} ${conv.people.length === 1 ? "person" : "people"}`
      : other?.role === "coach"
        ? "Your coach"
        : other?.role === "dietitian"
          ? "Team dietitian · only the two of you see this"
          : conv.kind === "dietitian"
            ? "Athlete · only the two of you see this"
            : "Athlete";

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : me.role === "dietitian" ? "dietitian" : "athlete"}>
      <div className="mx-auto max-w-3xl">
        <BackLink href="/messages" label="Messages" />
        <header className="mt-3 flex items-center gap-3 border-b border-white/[0.08] pb-4">
          <AvatarCircle look={conv.other_id ? looks[conv.other_id] : undefined} name={conv.title} size={44} group={conv.kind === "pod"} />
          <span className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{conv.title}</h1>
            <span className="block truncate text-xs text-white/50">{subtitle}</span>
          </span>
        </header>
        <div className="mt-2">
          <Thread conv={conv} me={me.id} initial={messages} initialRefs={refs} attach={attach} avatars={looks} hasMore={(latest ?? []).length === PAGE} />
        </div>
      </div>
    </DashboardShell>
  );
}
