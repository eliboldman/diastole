import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

/** "Message coach about this" link, carrying the workout into the thread as an attachment. */
export function MessageAbout({ to, name, activityId, workoutId }: { to: string; name: string; activityId?: string; workoutId?: string }) {
  const q = new URLSearchParams({ to });
  if (activityId) q.set("activity", activityId);
  if (workoutId) q.set("workout", workoutId);
  return (
    <Link
      href={`/messages/start?${q}`}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition hover:bg-white/[0.09] active:scale-95"
    >
      <MessageCircle size={16} className="text-emerald-200" aria-hidden />
      {`Message ${name} about this`}
    </Link>
  );
}

/**
 * The coach–athlete messages that point at this workout (pod threads stay in the pod).
 * Row-level security limits it to threads the viewer is in.
 */
export async function WorkoutMessages({ activityId, workoutId, me, names }: { activityId?: string; workoutId?: string; me: string; names: Record<string, string> }) {
  const supabase = await createClient();
  let q = supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, media_kind, created_at, conversations!inner(kind)")
    .eq("conversations.kind", "direct")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  q = activityId ? q.eq("activity_id", activityId) : q.eq("planned_workout_id", workoutId!);
  const { data } = await q;
  if (!data?.length) return null;
  const list = [...data].reverse();
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl sm:p-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Messages about this workout</h2>
        <Link href={`/messages/${list.at(-1)!.conversation_id}`} className="text-sm text-emerald-200 hover:underline">
          Open thread →
        </Link>
      </div>
      <ul className="grid gap-2 text-sm">
        {list.map((m) => (
          <li key={m.id} className="rounded-2xl bg-white/[0.04] px-3 py-2">
            <span className="font-medium text-white/90">{m.sender_id === me ? "You" : (names[m.sender_id] ?? "Coach")}</span>{" "}
            <span className="whitespace-pre-wrap break-words text-white/75">{m.body ?? (m.media_kind === "photo" ? "📷 Photo" : "🎤 Voice note")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
