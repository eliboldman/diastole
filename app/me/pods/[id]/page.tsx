import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import { LeavePod } from "@/components/PodButtons";
import PodActivityFeed from "@/components/PodActivityFeed";
import RecentDiscoveries from "@/components/secrets/RecentDiscoveries";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import PodChallenges, { type Challenge } from "@/components/PodChallenges";
import PodTabs, { type PodView } from "@/components/PodTabs";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import RememberPod from "@/components/RememberPod";

export default async function AthletePodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>; // ?view=feed | challenges; members is the default
}) {
  const me = await requireUser();
  const { id } = await params;
  const v = (await searchParams).view;
  const view: PodView = v === "feed" || v === "challenges" ? v : "members";
  const supabase = await createClient();
  // Returns null unless I'm an active member — the database enforces this.
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
  const [{ data: avatars }, { data: mine }] = await Promise.all([
    supabase.rpc("get_avatars", { p_ids: feed.members.map((m) => m.id) }),
    supabase.from("profiles").select("share_workout_details").eq("id", me.id).maybeSingle(),
  ]);

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <RememberPod id={id} />
      <Link href="/me/pods?all=1" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">
        <ChevronLeft size={16} aria-hidden /> All pods &amp; sharing
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{feed.pod.name}</h1>
        <LeavePod podId={id} name={feed.pod.name} />
      </div>
      <div className="mt-6">
        <PodTabs base={`/me/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "challenges" ? (
          <PodChallenges podId={id} challenges={(challenges ?? []) as Challenge[]} meId={me.id} canJoin isCoach={false} today={new Date().toLocaleDateString("en-CA", { timeZone: me.timezone })} units={me.units} />
        ) : view === "feed" ? (
          <>
            <RecentDiscoveries podId={id} />
            <PodActivityFeed podId={id} initial={(activities ?? []) as FeedItem[]} timeZone={me.timezone} units={me.units} avatars={(avatars ?? {}) as Record<string, unknown>} iShare={Boolean(mine?.share_workout_details)} />
          </>
        ) : (
          <PodFeed feed={feed} timeZone={me.timezone} units={me.units} props={props as PodPropsData | null} avatars={(avatars ?? {}) as Record<string, unknown>} streaks={(streaks ?? {}) as Record<string, number>} />
        )}
      </div>
    </AthleteShell>
  );
}
