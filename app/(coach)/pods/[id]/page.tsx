import { notFound } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export default async function CoachPodFeedPage({ params }: { params: Promise<{ id: string }> }) {
  const coach = await requireCoach();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: props }] = await Promise.all([
    supabase.rpc("get_pod_feed", { p_pod: id }),
    supabase.rpc("get_pod_props", { p_pod: id }),
  ]);
  if (!data) notFound();
  const feed = data as PodFeedData;

  return (
    <DashboardShell>
      <BackLink href="/pods" label="Pods" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{feed.pod.name}</h1>
      <p className="mt-2 text-sm text-white/55">This is what members who have accepted see of each other.</p>
      <div className="mt-8">
        <PodFeed feed={feed} timeZone={coach.timezone} units={coach.units} props={props as PodPropsData | null} />
      </div>
    </DashboardShell>
  );
}
