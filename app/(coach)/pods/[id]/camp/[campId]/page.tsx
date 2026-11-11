import Link from "next/link";
import { notFound } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import BackLink from "@/components/layout/BackLink";
import CampHub from "@/components/camp/CampHub";
import { getBoard, getCamp, getMessages } from "@/lib/camp/data";
import { createClient, requireCoach } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CoachCampPage({ params }: { params: Promise<{ id: string; campId: string }> }) {
  const coach = await requireCoach();
  const { id, campId } = await params;
  if (!UUID.test(campId)) notFound();
  const supabase = await createClient();
  const camp = await getCamp(supabase, campId);
  if (!camp || camp.pod_id !== id) notFound();
  const [board, messages] = await Promise.all([getBoard(supabase, campId), getMessages(supabase, campId)]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  return (
    <DashboardShell>
      <BackLink href={`/pods/${id}?view=challenges`} label="Pod" />
      <div className="mt-4">
        <CampHub camp={camp} board={board} messages={messages} today={today} me={coach.id} coach status={null} back={`/pods/${id}?view=challenges`} />
      </div>
      <Link href={`/pods/${id}?view=feed`} className="mt-6 inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">
        Pod feed →
      </Link>
    </DashboardShell>
  );
}
