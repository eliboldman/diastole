import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import { LeavePod } from "@/components/PodButtons";
import PodActivityFeed from "@/components/PodActivityFeed";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import PodTabs from "@/components/PodTabs";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireUser } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";

export default async function AthletePodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const view = (await searchParams).view === "members" ? "members" : "feed";
  const supabase = await createClient();
  // Returns null unless I'm an active member — the database enforces this.
  const [{ data }, { data: props }, { data: activities }] = await Promise.all([
    supabase.rpc("get_pod_feed", { p_pod: id }),
    view === "members" ? supabase.rpc("get_pod_props", { p_pod: id }) : Promise.resolve({ data: null }),
    view === "feed" ? supabase.rpc("get_pod_activity_feed", { p_pod: id, p_limit: FEED_PAGE }) : Promise.resolve({ data: null }),
  ]);
  if (!data) notFound();
  const feed = data as PodFeedData;

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <BackLink href="/me/pods" label="My pods" />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{feed.pod.name}</h1>
        <LeavePod podId={id} name={feed.pod.name} />
      </div>
      <div className="mt-6">
        <PodTabs base={`/me/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "feed" ? (
          <PodActivityFeed podId={id} initial={(activities ?? []) as FeedItem[]} timeZone={me.timezone} units={me.units} />
        ) : (
          <PodFeed feed={feed} timeZone={me.timezone} units={me.units} props={props as PodPropsData | null} />
        )}
      </div>
    </AthleteShell>
  );
}
