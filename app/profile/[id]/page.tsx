import { Flag, Pencil, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Avatar from "@/components/avatar/Avatar";
import GoalForm from "@/components/avatar/GoalForm";
import MetricCards from "@/components/avatar/MetricCards";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { clock, distance, whole } from "@/lib/activity/format";
import { buildMetricCards } from "@/lib/avatar/metrics";
import { PR_LABEL, refreshProgress, todayState } from "@/lib/avatar/progress";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile · Diastole" };

const UUID = /^[0-9a-f-]{36}$/i;

// Time math lives outside the component (render must stay pure).
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const withinDays = (iso: string, n: number) => Date.now() - Date.parse(iso) < n * 86_400_000;
const daysUntil = (date: string) => Math.ceil((Date.parse(`${date}T12:00:00Z`) - Date.now()) / 86_400_000);

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id: raw } = await params;
  if (raw === "me") redirect(`/profile/${me.id}`);
  if (!UUID.test(raw)) notFound();
  const id = raw;
  const supabase = await createClient();
  const admin = createAdminClient();

  // Who may open this: the athlete and their coach. (Pod mates come with pod sharing levels.)
  const { data: person } = await admin.from("profiles").select("id, full_name, timezone, coach_id, role").eq("id", id).maybeSingle();
  if (!person) notFound();
  const own = id === me.id;
  const coaching = me.role === "coach" && person.coach_id === me.id;
  if (!own && !coaching) notFound();

  const tz = person.timezone ?? me.timezone;
  const since90 = isoDaysAgo(90).slice(0, 10);
  const since8w = isoDaysAgo(56);
  const [{ data: avatar }, progress, today, { data: zones }, { data: days }, { data: acts }, { data: goals }] = await Promise.all([
    supabase.from("avatars").select("look").eq("athlete_id", id).maybeSingle(),
    refreshProgress(admin, id, tz),
    todayState(supabase, id),
    supabase.from("zone_history").select("field, value, changed_at").eq("athlete_id", id).order("changed_at"),
    supabase.from("daily_wellness").select("date, hrv_ms, resting_hr, vo2_max").eq("athlete_id", id).gte("date", since90).order("date"),
    supabase.from("activities").select("start_time, duration_s, training_load, distance_m").eq("athlete_id", id).gte("start_time", since8w),
    supabase.from("athlete_goals").select("race_name, race_date, block_name, block_ends").eq("athlete_id", id).maybeSingle(),
  ]);

  const cards = buildMetricCards({ zones: zones ?? [], days: days ?? [], acts: acts ?? [], units: me.units ?? "mi", timeZone: tz });
  const first = (person.full_name || "Athlete").split(" ")[0];
  // Recent PRs: real improvements (not the first-ever value) in the last 90 days, newest first.
  const seen = new Set<string>();
  const prs = progress.achievements
    .filter((a) => {
      const firstOne = !seen.has(a.key);
      seen.add(a.key);
      return !firstOne && a.key.startsWith("pr_") && withinDays(a.achieved_at, 90);
    })
    .reverse()
    .slice(0, 6);
  const prValue = (k: string, v: number | null) => (v === null ? "" : k === "pr_power_20m" ? whole(v, "W") : clock(v));
  const sentence = today.note ?? (own ? "Your readiness shows up here after your watch syncs last night's sleep." : `${first}'s readiness shows up after their watch syncs.`);

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      {coaching && !own && <BackLink href={`/athlete/${id}`} label={person.full_name || "Athlete"} />}
      <div className="mx-auto max-w-3xl">
        <section className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar look={avatar?.look ?? null} mood={today.mood} load={today.load} aura={progress.aura} badges={progress.badges} className="h-72 w-48 sm:h-80 sm:w-52" title={`${first}'s avatar`} />
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{person.full_name || "Athlete"}</h1>
          <p className="mt-2 max-w-md text-[15px] text-white/70">{sentence}</p>
          {(progress.streak.current >= 2 || progress.badges.length > 0) && (
            <p className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
              {progress.streak.current >= 2 && (
                <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-3 py-1 text-amber-100">{`🔥 ${progress.streak.current}-week streak`}</span>
              )}
              {progress.aura > 0 && <span className="rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] px-3 py-1 text-emerald-100">{`✨ Aura level ${progress.aura}`}</span>}
            </p>
          )}
          {own && (
            <Link href="/profile/edit" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-medium text-black transition active:scale-95 hover:bg-emerald-200">
              <Pencil size={16} /> {avatar ? "Edit avatar" : "Create your avatar"}
            </Link>
          )}
        </section>

        {(goals?.race_name || goals?.block_name || coaching) && (
          <section className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1.5">
                {goals?.race_name && (
                  <p className="flex items-center gap-2">
                    <Flag size={16} className="shrink-0 text-emerald-200" aria-hidden />
                    <span className="min-w-0 truncate font-medium">{goals.race_name}</span>
                    {goals.race_date && daysUntil(goals.race_date) >= 0 && <span className="shrink-0 text-sm text-white/55">{`in ${daysUntil(goals.race_date)} days`}</span>}
                  </p>
                )}
                {goals?.block_name && (
                  <p className="text-sm text-white/65">
                    {`Current block: ${goals.block_name}`}
                    {goals.block_ends && ` · ends ${new Date(`${goals.block_ends}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
                  </p>
                )}
                {!goals?.race_name && !goals?.block_name && <p className="text-sm text-white/55">No goal race or training block set yet.</p>}
              </div>
              {coaching && <GoalForm athleteId={id} goals={goals} />}
            </div>
          </section>
        )}

        {cards.length > 0 ? (
          <section className="mt-6">
            <MetricCards cards={cards} />
          </section>
        ) : (
          <p className="mt-8 text-center text-sm text-white/55">Numbers show up here as workouts and sleep sync.</p>
        )}

        {prs.length > 0 && (
          <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Trophy size={16} className="text-amber-200" aria-hidden /> Recent PRs
            </h2>
            <ul className="divide-y divide-white/[0.06]">
              {prs.map((p) => (
                <li key={`${p.key}-${p.achieved_at}`}>
                  <Link href={p.activity_id ? `/activity/${p.activity_id}` : "#"} className="flex min-h-12 items-center justify-between gap-3 text-sm hover:text-emerald-100">
                    <span className="min-w-0 truncate">{PR_LABEL[p.key] ?? p.key}</span>
                    <span className="shrink-0 tabular-nums text-white/80">
                      {prValue(p.key, p.value)}
                      <span className="ml-2 text-white/40">{new Date(p.achieved_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {progress.achievements.some((a) => a.key === "longest_run") && (
              <p className="mt-2 text-xs text-white/45">
                {`Longest run ${distance(Math.max(...progress.achievements.filter((a) => a.key === "longest_run").map((a) => a.value ?? 0)), me.units ?? "mi")}`}
              </p>
            )}
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
