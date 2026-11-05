import { notFound } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import PodActivityFeed from "@/components/PodActivityFeed";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import PodTabs from "@/components/PodTabs";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export default async function CoachPodFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const coach = await requireCoach();
  const { id } = await params;
  const view = (await searchParams).view === "members" ? "members" : "feed";
  const supabase = await createClient();
  const [{ data }, { data: props }, { data: activities }] = await Promise.all([
    supabase.rpc("get_pod_feed", { p_pod: id }),
    view === "members" ? supabase.rpc("get_pod_props", { p_pod: id }) : Promise.resolve({ data: null }),
    view === "feed" ? supabase.rpc("get_pod_activity_feed", { p_pod: id, p_limit: FEED_PAGE }) : Promise.resolve({ data: null }),
  ]);
  if (!data) notFound();
  const feed = data as PodFeedData;

  return (
    <DashboardShell>
      <BackLink href="/pods" label="Pods" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{feed.pod.name}</h1>
      <p className="mt-2 text-sm text-white/55">This is what members who have accepted see of each other.</p>
      <div className="mt-6">
        <PodTabs base={`/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "feed" ? (
          <PodActivityFeed podId={id} initial={(activities ?? []) as FeedItem[]} timeZone={coach.timezone} units={coach.units} />
        ) : (
          <PodFeed feed={feed} timeZone={coach.timezone} units={coach.units} props={props as PodPropsData | null} />
        )}
      </div>
    </DashboardShell>
  );
}
