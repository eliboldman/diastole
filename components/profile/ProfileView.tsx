import { Flag, Pencil, Trophy } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import Avatar from "@/components/avatar/Avatar";
import GoalForm from "@/components/avatar/GoalForm";
import MetricCards from "@/components/avatar/MetricCards";
import BackLink from "@/components/layout/BackLink";
import { clock, distance, shortDistance, sportLabel, whole } from "@/lib/activity/format";
import { buildMetricCards } from "@/lib/avatar/metrics";
import type { Mood } from "@/components/avatar/Avatar";
import { PR_LABEL, refreshProgress, summarize, todayState, type Achievement } from "@/lib/avatar/progress";
import { PAIN_LABEL, SPOTS, spotLabel, type Pain, type PainLevel } from "@/lib/avatar/pain";
import { normalizeStrain, recentStrain, type Strain } from "@/lib/avatar/strain";
import { createAdminClient, createClient, type Profile } from "@/lib/supabase/server";

// Time math lives outside the component (render must stay pure).
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const withinDays = (iso: string, n: number) => Date.now() - Date.parse(iso) < n * 86_400_000;
const DEFAULT_ORDER = ["goals", "numbers", "metrics", "prs", "workouts"];
const daysUntil = (date: string) => Math.ceil((Date.parse(`${date}T12:00:00Z`) - Date.now()) / 86_400_000);

/**
 * A person's profile: avatar, goals, numbers, PRs. The athlete and their coach see everything; pod
 * mates see only what the athlete shares. Below the avatar, sections render in `order` (visible keys);
 * `sections` adds or replaces keyed sections (the Me tab adds readiness, form and more). `header`
 * sits above the avatar.
 */
export default async function ProfileView({ id, me, header, sections, order }: { id: string; me: Profile; header?: ReactNode; sections?: Record<string, ReactNode>; order?: string[] }) {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Who may open this: the athlete and their coach see everything; pod mates see what the athlete
  // shares (the database decides, in get_pod_profile).
  const { data: person } = await admin.from("profiles").select("id, full_name, timezone, coach_id, role").eq("id", id).maybeSingle();
  if (!person) notFound();
  const own = id === me.id;
  const coaching = me.role === "coach" && person.coach_id === me.id;
  const tz = person.timezone ?? me.timezone;

  type Goals = { race_name: string | null; race_date: string | null; block_name: string | null; block_ends: string | null } | null;
  type Act = { id?: string; sport?: string | null; name?: string | null; start_time: string; duration_s: number | null; training_load?: number | null; distance_m: number | null };
  let look: unknown = null;
  let mood: Mood = null;
  let strain: Strain = {};
  let note: string | null = null;
  let sore: Pain = {}; // self and coach only
  let achievements: Achievement[] = [];
  let aura = 0;
  let badges: string[] = [];
  let streak = { current: 0, best: 0 };
  let zones: { field: string; value: number; changed_at: string }[] = [];
  let days: { date: string; hrv_ms: number | null; resting_hr: number | null; vo2_max: number | null }[] = [];
  let acts: Act[] = [];
  let goals: Goals = null;
  let shares: { readiness: boolean; training: boolean; details: boolean } | null = null; // null = sees everything

  if (own || coaching) {
    const since90 = isoDaysAgo(90).slice(0, 10);
    const since8w = isoDaysAgo(56);
    const [{ data: avatar }, progress, today, z, d, a, g] = await Promise.all([
      supabase.from("avatars").select("look").eq("athlete_id", id).maybeSingle(),
      refreshProgress(admin, id, tz),
      todayState(supabase, id),
      supabase.from("zone_history").select("field, value, changed_at").eq("athlete_id", id).order("changed_at"),
      supabase.from("daily_wellness").select("date, hrv_ms, resting_hr, vo2_max").eq("athlete_id", id).gte("date", since90).order("date"),
      supabase.from("activities").select("start_time, duration_s, training_load, distance_m").eq("athlete_id", id).gte("start_time", since8w),
      supabase.from("athlete_goals").select("race_name, race_date, block_name, block_ends").eq("athlete_id", id).maybeSingle(),
    ]);
    look = avatar?.look ?? null;
    ({ mood, strain, note, sore } = today);
    ({ achievements, aura, badges, streak } = progress);
    zones = z.data ?? [];
    days = d.data ?? [];
    acts = a.data ?? [];
    goals = g.data;
  } else {
    // A pod mate: only what this athlete shares, straight from the database.
    const { data } = await supabase.rpc("get_pod_profile", { p_athlete: id });
    if (!data) notFound();
    const p = data as {
      look: unknown;
      shares: { readiness: boolean; training: boolean; hrv: boolean; sleep: boolean; stress: boolean; details: boolean };
      readiness: { date: string; overall: string; note: string } | null;
      strain: { strain: unknown; at: string }[] | null;
      zones: { field: string; value: number; changed_at: string }[] | null;
      achievements: Achievement[] | null;
      goals: Goals;
      activities: Act[] | null;
      wellness: { date: string; hrv_ms: number | null; resting_hr: number | null }[] | null;
    };
    shares = p.shares;
    look = p.look;
    const r = p.readiness;
    const fresh = r && withinDays(`${r.date}T12:00:00Z`, 2.5);
    mood = r && fresh ? (r.overall === "green" ? "fresh" : r.overall === "yellow" ? "ok" : r.overall === "red" ? "tired" : null) : null;
    note = r && fresh ? r.note : null;
    strain = recentStrain((p.strain ?? []).map((x) => ({ strain: normalizeStrain(x.strain), at: x.at })));
    achievements = p.achievements ?? [];
    ({ aura, badges } = summarize(achievements, streak, Boolean(p.goals?.race_name)));
    zones = p.zones ?? [];
    days = (p.wellness ?? []).map((w) => ({ ...w, vo2_max: null }));
    acts = p.activities ?? [];
    goals = p.goals;
  }

  const cards = buildMetricCards({ zones, days, acts: acts.map((a) => ({ ...a, training_load: a.training_load ?? null })), units: me.units ?? "mi", timeZone: tz });
  const first = (person.full_name || "Athlete").split(" ")[0];
  // Recent PRs: real improvements (not the first-ever value) in the last 90 days, newest first.
  const seen = new Set<string>();
  const prs = achievements
    .filter((a) => {
      const firstOne = !seen.has(a.key);
      seen.add(a.key);
      return !firstOne && a.key.startsWith("pr_") && withinDays(a.achieved_at, 90);
    })
    .reverse()
    .slice(0, 6);
  const prValue = (k: string, v: number | null) => (v === null ? "" : k === "pr_power_20m" ? whole(v, "W") : clock(v));
  const sentence =
    note ??
    (own
      ? "Your readiness shows up here after your watch syncs last night's sleep."
      : shares && !shares.readiness
        ? `${first} shares their avatar and name with the pod.`
        : `${first}'s readiness shows up after their watch syncs.`);

  // Each section by key, so the Me tab can hide and reorder them alongside its own sections.
  const blocks: Record<string, ReactNode> = {
    goals: (
      <>
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

      </>
    ),
    metrics: (
      <>
        {cards.length > 0 ? (
          <section className="mt-6">
            <MetricCards cards={cards} />
          </section>
        ) : (
          <p className="mt-8 text-center text-sm text-white/55">Numbers show up here as workouts and sleep sync.</p>
        )}

      </>
    ),
    prs: (
      <>
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
            {achievements.some((a) => a.key === "longest_run") && (
              <p className="mt-2 text-xs text-white/45">
                {`Longest run ${distance(Math.max(...achievements.filter((a) => a.key === "longest_run").map((a) => a.value ?? 0)), me.units ?? "mi")}`}
              </p>
            )}
          </section>
        )}
      </>
    ),
    workouts: (
      <>
        {shares?.training && acts.length > 0 && (
          <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
            <h2 className="mb-2 text-sm font-medium">Recent workouts</h2>
            <ul className="divide-y divide-white/[0.06]">
              {acts.slice(0, 8).map((a) => {
                const row = (
                  <>
                    <span className="min-w-0 truncate">{a.name || sportLabel(a.sport ?? null)}</span>
                    <span className="shrink-0 tabular-nums text-white/55">
                      {[clock(a.duration_s), shortDistance(a.distance_m, me.units ?? "mi", a.sport)].filter(Boolean).join(" · ")}
                    </span>
                  </>
                );
                return (
                  <li key={a.id ?? a.start_time}>
                    {shares.details && a.id ? (
                      <Link href={`/activity/${a.id}`} className="flex min-h-12 items-center justify-between gap-3 text-sm hover:text-emerald-100">
                        {row}
                      </Link>
                    ) : (
                      <span className="flex min-h-12 items-center justify-between gap-3 text-sm">{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </>
    ),
    ...sections,
  };

  return (
    <>
      {header}
      {coaching && !own && <BackLink href={`/athlete/${id}`} label={person.full_name || "Athlete"} />}
      {shares && <BackLink href={me.role === "coach" ? "/pods" : "/me/pods"} label="Pods" />}
      <div className="mx-auto max-w-3xl">
        <section className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar look={look} mood={mood} strain={strain} aura={aura} badges={badges} className="h-72 w-48 sm:h-80 sm:w-52" title={`${first}'s avatar`} />
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{person.full_name || "Athlete"}</h1>
          <p className="mt-2 max-w-md text-[15px] text-white/70">{sentence}</p>
          {Object.keys(sore).length > 0 && (
            <p className="mt-2 max-w-md text-sm text-rose-100/80">
              {`Sore: ${SPOTS.filter((s) => sore[s])
                .map((s) => `${spotLabel(s).toLowerCase()} (${PAIN_LABEL[sore[s] as PainLevel].toLowerCase()})`)
                .join(", ")}`}
            </p>
          )}
          {(streak.current >= 2 || aura > 0) && (
            <p className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
              {streak.current >= 2 && (
                <span className="rounded-full border border-amber-200/20 bg-amber-200/[0.06] px-3 py-1 text-amber-100">{`🔥 ${streak.current}-week streak`}</span>
              )}
              {aura > 0 && <span className="rounded-full border border-emerald-200/20 bg-emerald-200/[0.06] px-3 py-1 text-emerald-100">{`✨ Aura level ${aura}`}</span>}
            </p>
          )}
          {own && (
            <Link href="/profile/edit" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-medium text-black transition active:scale-95 hover:bg-emerald-200">
              <Pencil size={16} /> {look ? "Edit avatar" : "Create your avatar"}
            </Link>
          )}
        </section>

        {(order ?? DEFAULT_ORDER).map((k) => (
          <Fragment key={k}>{blocks[k]}</Fragment>
        ))}
      </div>
    </>
  );
}
