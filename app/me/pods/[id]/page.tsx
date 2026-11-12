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
import CampList from "@/components/camp/CampList";
import { getPodCamps } from "@/lib/camp/data";
import PodBoosts from "@/components/grit/PodBoosts";
import PodBaton from "@/components/baton/PodBaton";
import Campfire from "@/components/campfire/Campfire";
import LatestEpisode from "@/components/stories/LatestEpisode";
import { TIPS } from "@/lib/discovery";

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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const camps = view === "challenges" ? await getPodCamps(supabase, id, me.id, today) : [];
  // Avatars the viewer may see (row-level security leaves out anyone else).
  const [{ data: avatars }, { data: mine }, { data: boostRows }, { data: boostItem }] = await Promise.all([
    supabase.rpc("get_avatars", { p_ids: feed.members.map((m) => m.id) }),
    supabase.from("profiles").select("share_workout_details, seen_tips").eq("id", me.id).maybeSingle(),
    supabase.from("pod_boosts").select("id, from_id, to_id, created_at").eq("pod_id", id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(20),
    supabase.from("grit_items").select("qty").eq("athlete_id", me.id).eq("item_id", "ability:boost").maybeSingle(),
  ]);
  const seenTips = ((mine?.seen_tips ?? []) as string[]);
  const firstOf = (pid: string) => feed.members.find((m) => m.id === pid)?.name.split(" ")[0] ?? "Coach";
  const boosts = (boostRows ?? []).map((b) => ({ id: b.id, to_id: b.to_id, from_name: b.from_id === me.id ? "You" : firstOf(b.from_id), to_name: firstOf(b.to_id) }));

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
      <PodBoosts podId={id} boosts={boosts} members={feed.members.map((m) => ({ id: m.id, name: m.name }))} meId={me.id} owned={boostItem?.qty ?? 0} />
      <div className="mt-6">
        <PodTabs base={`/me/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "challenges" ? (
          <>
            {camps.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-3 text-lg font-medium">Training camps</h2>
                <CampList camps={camps} base={`/me/pods/${id}`} today={today} />
              </section>
            )}
            <PodChallenges podId={id} challenges={(challenges ?? []) as Challenge[]} meId={me.id} canJoin isCoach={false} today={today} units={me.units} />
          </>
        ) : view === "feed" ? (
          <>
            <RecentDiscoveries podId={id} />
            <PodActivityFeed podId={id} initial={(activities ?? []) as FeedItem[]} timeZone={me.timezone} units={me.units} avatars={(avatars ?? {}) as Record<string, unknown>} iShare={Boolean(mine?.share_workout_details)} />
          </>
        ) : (
          <>
          <LatestEpisode podId={id} />
          <Campfire podId={id} meId={me.id} coach={false} names={Object.fromEntries(feed.members.map((m) => [m.id, m.name.split(" ")[0]]))} members={feed.members.length} tipSeen={seenTips.includes(TIPS.campfire.id)} />
          <PodBaton podId={id} meId={me.id} names={Object.fromEntries(feed.members.map((m) => [m.id, m.name.split(" ")[0]]))} tipSeen={seenTips.includes(TIPS.baton.id)} />
          <PodFeed feed={feed} timeZone={me.timezone} units={me.units} props={props as PodPropsData | null} avatars={(avatars ?? {}) as Record<string, unknown>} streaks={(streaks ?? {}) as Record<string, number>} />
          </>
        )}
      </div>
    </AthleteShell>
  );
}
