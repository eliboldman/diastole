import { notFound } from "next/navigation";

import DashboardShell from "@/components/layout/DashboardShell";
import PodActivityFeed from "@/components/PodActivityFeed";
import RecentDiscoveries from "@/components/secrets/RecentDiscoveries";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import PodChallenges, { type Challenge } from "@/components/PodChallenges";
import PodTabs, { type PodView } from "@/components/PodTabs";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export default async function CoachPodFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>; // ?view=feed | challenges; members is the default
}) {
  const coach = await requireCoach();
  const { id } = await params;
  const v = (await searchParams).view;
  const view: PodView = v === "feed" || v === "challenges" ? v : "members";
  const supabase = await createClient();
  const [{ data }, { data: props }, { data: streaks }, { data: activities }, { data: challenges }] = await Promise.all([
    supabase.rpc("get_pod_feed", { p_pod: id }),
    view === "members" ? supabase.rpc("get_pod_props", { p_pod: id }) : Promise.resolve({ data: null }),
    view === "members" ? supabase.rpc("get_pod_streaks", { p_pod: id }) : Promise.resolve({ data: null }),
    view === "feed" ? supabase.rpc("get_pod_activity_feed", { p_pod: id, p_limit: FEED_PAGE }) : Promise.resolve({ data: null }),
    view === "challenges" ? supabase.rpc("get_pod_challenges", { p_pod: id }) : Promise.resolve({ data: null }),
  ]);
  if (!data) notFound();
  const feed = data as PodFeedData;
  // Avatars the viewer may see (row-level security leaves out anyone else).
  const { data: avatars } = await supabase.rpc("get_avatars", { p_ids: feed.members.map((m) => m.id) });

  return (
    <DashboardShell>
      <BackLink href="/pods" label="Pods" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{feed.pod.name}</h1>
      <p className="mt-2 text-sm text-white/55">This is what members who have accepted see of each other.</p>
      <div className="mt-6">
        <PodTabs base={`/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "challenges" ? (
          <PodChallenges podId={id} challenges={(challenges ?? []) as Challenge[]} meId={coach.id} canJoin={false} isCoach today={new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone })} units={coach.units} />
        ) : view === "feed" ? (
          <>
            <RecentDiscoveries podId={id} />
            <PodActivityFeed podId={id} initial={(activities ?? []) as FeedItem[]} timeZone={coach.timezone} units={coach.units} avatars={(avatars ?? {}) as Record<string, unknown>} />
          </>
        ) : (
          <PodFeed feed={feed} timeZone={coach.timezone} units={coach.units} props={props as PodPropsData | null} avatars={(avatars ?? {}) as Record<string, unknown>} streaks={(streaks ?? {}) as Record<string, number>} />
        )}
      </div>
    </DashboardShell>
  );
}
