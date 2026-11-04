import Link from "next/link";
import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import { LeavePod } from "@/components/PodButtons";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import { createClient, requireUser } from "@/lib/supabase/server";

export default async function AthletePodPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const supabase = await createClient();
  // Returns null unless I'm an active member — the database enforces this.
  const [{ data }, { data: props }] = await Promise.all([
    supabase.rpc("get_pod_feed", { p_pod: id }),
    supabase.rpc("get_pod_props", { p_pod: id }),
  ]);
  if (!data) notFound();
  const feed = data as PodFeedData;

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href="/me/pods" className="inline-flex min-h-11 items-center text-sm text-white/60 hover:text-white">
        ← My pods
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{feed.pod.name}</h1>
        <LeavePod podId={id} name={feed.pod.name} />
      </div>
      <div className="mt-8">
        <PodFeed feed={feed} timeZone={me.timezone} props={props as PodPropsData | null} />
      </div>
    </AthleteShell>
  );
}
