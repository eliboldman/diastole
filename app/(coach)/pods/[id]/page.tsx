import { notFound } from "next/navigation";
import PodBoosts from "@/components/grit/PodBoosts";
import Campfire from "@/components/campfire/Campfire";

import DashboardShell from "@/components/layout/DashboardShell";
import PodActivityFeed from "@/components/PodActivityFeed";
import RecentDiscoveries from "@/components/secrets/RecentDiscoveries";
import PodFeed, { type PodFeedData, type PodPropsData } from "@/components/PodFeed";
import PodChallenges, { type Challenge } from "@/components/PodChallenges";
import PodTabs, { type PodView } from "@/components/PodTabs";
import { FEED_PAGE, type FeedItem } from "@/lib/pod-feed-types";
import { createClient, requireCoach } from "@/lib/supabase/server";
import BackLink from "@/components/layout/BackLink";
import CampCreator from "@/components/camp/CampCreator";
import CampList from "@/components/camp/CampList";
import { getPodCamps } from "@/lib/camp/data";

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
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const [camps, { data: templates }] =
    view === "challenges" ? await Promise.all([getPodCamps(supabase, id, coach.id, today), supabase.from("plan_templates").select("id, name, weeks").lte("weeks", 4).order("name")]) : [[], { data: [] }];
  // Avatars the viewer may see (row-level security leaves out anyone else).
  const [{ data: avatars }, { data: boostRows }] = await Promise.all([
    supabase.rpc("get_avatars", { p_ids: feed.members.map((m) => m.id) }),
    supabase.from("pod_boosts").select("id, from_id, to_id").eq("pod_id", id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(20),
  ]);
  const firstOf = (pid: string) => feed.members.find((m) => m.id === pid)?.name.split(" ")[0] ?? "You";
  const boosts = (boostRows ?? []).map((b) => ({ id: b.id, to_id: b.to_id, from_name: firstOf(b.from_id), to_name: firstOf(b.to_id) }));

  return (
    <DashboardShell>
      <BackLink href="/pods" label="Pods" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">{feed.pod.name}</h1>
      <p className="mt-2 text-sm text-white/55">This is what members who have accepted see of each other.</p>
      <PodBoosts podId={id} boosts={boosts} members={[]} meId={coach.id} owned={0} />
      <Campfire podId={id} meId={coach.id} coach names={{ ...Object.fromEntries(feed.members.map((m) => [m.id, m.name.split(" ")[0]])), [coach.id]: (coach.full_name || "Coach").split(" ")[0] }} members={feed.members.length} />
      <div className="mt-6">
        <PodTabs base={`/pods/${id}`} view={view} />
      </div>
      <div className="mt-6">
        {view === "challenges" ? (
          <>
            <section className="mb-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
              <h2 className="text-lg font-medium">Training camps</h2>
              <p className="mb-4 mt-1 text-sm text-white/55">A shared block of training for the pod, scaled to each athlete, with a team goal and your daily message.</p>
              <CampList camps={camps} base={`/pods/${id}`} today={today} />
              <details className={camps.length ? "mt-4" : ""} open={!camps.length}>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Start a camp</summary>
                <div className="mt-3">
                  <CampCreator podId={id} templates={(templates ?? []) as { id: string; name: string; weeks: number }[]} today={today} />
                </div>
              </details>
            </section>
            <PodChallenges podId={id} challenges={(challenges ?? []) as Challenge[]} meId={coach.id} canJoin={false} isCoach today={today} units={coach.units} />
          </>
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
