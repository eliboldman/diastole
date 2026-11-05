import { notFound, redirect } from "next/navigation";

import { createClient, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Opens (or creates) a conversation, then lands in it.
 * ?to=<person id>|coach for a coach–athlete thread, ?pod=<pod id> for a pod thread;
 * ?activity=<id> or ?workout=<id> carries a workout to attach to the first message.
 */
export default async function StartConversation({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const q = await searchParams;
  const supabase = await createClient();

  let id: string | null = null;
  if (q.pod && UUID.test(q.pod)) {
    ({ data: id } = await supabase.rpc("open_pod_conversation", { p_pod: q.pod }));
  } else {
    const to = q.to === "coach" ? me.coach_id : q.to;
    if (to && UUID.test(to)) ({ data: id } = await supabase.rpc("open_direct_conversation", { p_other: to }));
  }
  if (!id) notFound();

  const carry = new URLSearchParams();
  if (q.activity && UUID.test(q.activity)) carry.set("activity", q.activity);
  else if (q.workout && UUID.test(q.workout)) carry.set("workout", q.workout);
  redirect(`/messages/${id}${carry.size ? `?${carry}` : ""}`);
}
