import Link from "next/link";
import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import BackLink from "@/components/layout/BackLink";
import CampHub from "@/components/camp/CampHub";
import { getBoard, getCamp, getMessages } from "@/lib/camp/data";
import { createClient, requireUser } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function AthleteCampPage({ params }: { params: Promise<{ id: string; campId: string }> }) {
  const me = await requireUser();
  const { id, campId } = await params;
  if (!UUID.test(campId)) notFound();
  const supabase = await createClient();
  const camp = await getCamp(supabase, campId); // row-level security: pod members and the coach
  if (!camp || camp.pod_id !== id) notFound();
  const [board, messages, { data: mine }] = await Promise.all([getBoard(supabase, campId), getMessages(supabase, campId), supabase.from("camp_members").select("status").eq("camp_id", campId).eq("athlete_id", me.id).maybeSingle()]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href={`/me/pods/${id}?view=challenges`} label="Pod" />
      <div className="mt-4">
        <CampHub camp={camp} board={board} messages={messages} today={today} me={me.id} coach={false} status={(mine?.status ?? null) as "joined" | "declined" | "left" | null} back={`/me/pods/${id}`} />
      </div>
      <Link href={`/me/pods/${id}?view=feed`} className="mt-6 inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">
        See what the pod&apos;s been doing →
      </Link>
    </AthleteShell>
  );
}
