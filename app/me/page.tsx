import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import SyncedAgo from "@/components/SyncedAgo";

import CheckinPrompt from "@/components/avatar/CheckinPrompt";
import WeeklyProgress from "@/components/WeeklyProgress";
import GearCheck from "@/components/GearCheck";
import TodaySecrets from "@/components/secrets/TodaySecrets";
import Spotlight from "@/components/Spotlight";
import WhatsNew from "@/components/WhatsNew";
import { latestRelease, seen, TIPS } from "@/lib/discovery";
import LifeHappened from "@/components/LifeHappened";
import PausedCard from "@/components/PausedCard";
import RecoveryCard from "@/components/recovery/RecoveryCard";
import Streaks from "@/components/Streaks";
import Welcome from "@/components/Welcome";
import FuelToday from "@/components/fuel/FuelToday";
import RaceWeek from "@/components/race/RaceWeek";
import AthleteShell from "@/components/AthleteShell";
import LayoutCustomizer from "@/components/LayoutCustomizer";
import { FlagBadge } from "@/components/coach/Flags";
import { RespondToInvite } from "@/components/PodButtons";
import { clock, shortDistance, sportLabel } from "@/lib/activity/format";
import { resolveLayout, visibleSections } from "@/lib/layout-prefs";
import type { Flag } from "@/lib/readiness/engine";
import { createClient, requireUser } from "@/lib/supabase/server";
import { pullIfStale } from "@/lib/intervals/pull-soon";
import { after } from "next/server";

export const metadata: Metadata = { title: "My Diastole" };

const SHARED_WITH_POD = [
  "Your name and avatar",
  "Nothing else unless you choose it in My pods: readiness, your workouts and PRs, and (each separately) HRV, sleep or stress",
];

export default async function MePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = await requireUser();
  // Rides from Zwift/Rouvy (via intervals.icu) come in after the page is sent, at most every two hours.
  after(() => pullIfStale(me.id));
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });

  const [{ data: readiness }, { data: workouts }, { data: device }, { data: memberships }, { data: recent }, { data: welcome }, { welcome: replay }, { data: layoutRow }] = await Promise.all([
    supabase.from("readiness_scores").select("date, overall, recovery, sleep, stress, load, note").eq("athlete_id", me.id).order("date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("planned_workouts").select("id, scheduled_date, title, sport, status, why").eq("athlete_id", me.id).is("deleted_at", null).gte("scheduled_date", today).neq("status", "draft").order("scheduled_date").limit(7),
    supabase.from("device_connections").select("source, last_synced_at").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("pod_members").select("pod_id, status, pods(name)").eq("athlete_id", me.id).in("status", ["invited", "active"]),
    supabase.from("activities").select("id, name, sport, start_time, duration_s, distance_m").eq("athlete_id", me.id).order("start_time", { ascending: false }).limit(3),

    supabase.from("profiles").select("welcomed_at").eq("id", me.id).maybeSingle(),
    searchParams,
    supabase.from("profiles").select("layout, health_pause, seen_tips").eq("id", me.id).maybeSingle(),
  ]);
  // "Life happened": yesterday's session if it wasn't done, and sick/injured mode.
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const [{ data: missedRow }, { data: symptomsToday }, { data: rhrRow }] = await Promise.all([
    supabase.from("planned_workouts").select("id, title").eq("athlete_id", me.id).eq("scheduled_date", yesterday).in("status", ["approved", "sent"]).is("deleted_at", null).limit(1).maybeSingle(),
    supabase.from("symptom_logs").select("symptoms, energy").eq("athlete_id", me.id).eq("date", today).maybeSingle(),
    // Today's resting heart rate sets the logo's beat (Heartbeat secret).
    supabase.from("daily_wellness").select("resting_hr").eq("athlete_id", me.id).not("resting_hr", "is", null).order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const pause = (layoutRow?.health_pause ?? null) as { kind: "sick" | "injured"; since: string } | null;
  const todayWorkout = (workouts ?? []).find((w) => w.scheduled_date === today && (w.status === "approved" || w.status === "sent")) ?? null;
  const hasCoach = Boolean(me.coach_id && me.coach_id !== me.id);
  const seenTips = (layoutRow?.seen_tips ?? []) as string[];
  const release = latestRelease();

  const invites = (memberships ?? []).filter((m) => m.status === "invited");
  const pods = (memberships ?? []).filter((m) => m.status === "active");
  const podName = (m: (typeof invites)[number]) => (m.pods as unknown as { name: string } | null)?.name ?? "Pod";
  const firstName = me.full_name?.split(" ")[0];
  // Athletes see the welcome tour once; anyone can replay it from Me (?welcome=1).
  const showWelcome = replay === "1" || (me.role === "athlete" && !welcome?.welcomed_at);

  // Sections the person can hide and reorder (Customize). Welcome, invites and the watch prompt always show.
  const blocks: Record<string, ReactNode> = {
    race: (
      <>
      <RaceWeek athleteId={me.id} today={today} units={me.units === "km" ? "km" : "mi"} />
      </>
    ),
    progress: (
      <>
      <WeeklyProgress athleteId={me.id} timeZone={me.timezone} />
      </>
    ),
    streaks: (
      <>
      <Streaks athleteId={me.id} timeZone={me.timezone} today={today} />
      </>
    ),
    checkin: (
      <>
      <CheckinPrompt athleteId={me.id} />
      </>
    ),
    gear: (
      <>
      <GearCheck athleteId={me.id} today={today} tipSeen={seen(seenTips, TIPS.gear.id)} />
      </>
    ),
    recovery: (
      <>
      <RecoveryCard athleteId={me.id} today={today} tipSeen={seen(seenTips, TIPS.recovery.id)} />
      </>
    ),
    readiness: (
      <>
      <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FlagBadge flag={(readiness?.overall as Flag) ?? "unknown"} large />
          {device && (
            <span className="text-xs text-white/55">
              {device.source === "garmin" ? "Garmin" : "Apple Watch"} · <SyncedAgo at={device.last_synced_at} />
            </span>
          )}
        </div>
        <p className="mt-3 text-white/70">{readiness?.note ?? "Waiting for your first data."}</p>
        <Link href="/account/body" className="mt-4 inline-flex min-h-11 items-center text-sm text-emerald-200 hover:underline">
          Recovery, sleep, stress and load →
        </Link>
      </section>
      </>
    ),
    fuel: (
      <>
      <FuelToday athleteId={me.id} today={today} timeZone={me.timezone} />
      </>
    ),
    upcoming: (
      <>
      <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
        <h2 className="text-lg font-medium">Coming up</h2>
        {!workouts?.length ? (
          <p className="mt-2 text-sm text-white/55">No workouts scheduled.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {workouts.map((w, i) => (
              <li key={w.id} className="border-t border-white/[0.09]">
                <Link href={`/training/workouts/${w.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg py-1 hover:bg-white/[0.04]">
                  <span className="min-w-0 truncate">
                    <span className="text-white/50">
                      {new Date(`${w.scheduled_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>{" "}
                    {w.title}
                  </span>
                  <span className="shrink-0 text-xs uppercase tracking-wider text-white/55">{w.sport}</span>
                </Link>
                {i === 0 && w.why && <p className="pb-2 text-sm leading-relaxed text-emerald-50/80">{w.why}</p>}
              </li>
            ))}
          </ul>
        )}
        {device?.source === "garmin" && workouts?.length ? (
          <p className="mt-3 text-xs text-white/50">These are on your Garmin calendar after your watch syncs.</p>
        ) : null}
        {!pause && missedRow && <Spotlight tip={TIPS.lifeHappened} seen={seen(seenTips, TIPS.lifeHappened.id)} />}
        {!pause && <LifeHappened today={todayWorkout ? { id: todayWorkout.id, title: todayWorkout.title } : null} missed={missedRow ?? null} hasCoach={hasCoach} />}
      </section>
      </>
    ),
    recent: (
      <>
      {(recent?.length ?? 0) > 0 && (
        <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Recent workouts</h2>
            <Link href="/training" className="text-sm text-emerald-200 hover:underline">
              All training →
            </Link>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {recent!.map((a) => (
              <li key={a.id} className="border-t border-white/[0.09]">
                <Link href={`/activity/${a.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg py-1 hover:bg-white/[0.04]">
                  <span className="min-w-0 truncate">
                    <span className="text-white/50">
                      {new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: me.timezone })}
                    </span>{" "}
                    {a.name || sportLabel(a.sport)}
                  </span>
                  <span className="shrink-0 text-xs text-white/55">{[clock(a.duration_s), shortDistance(a.distance_m, me.units, a.sport)].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>
    ),
    pods: (
      <>
      {pods.length > 0 && (
        <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6" style={{ animationDelay: "80ms" }}>
          <h2 className="text-lg font-medium">My pods</h2>
          <ul className="mt-3 space-y-2">
            {pods.map((p) => (
              <li key={p.pod_id}>
                <Link href={`/me/pods/${p.pod_id}`} className="flex min-h-12 items-center justify-between rounded-xl px-2 transition active:scale-[0.99] hover:bg-white/[0.06]">
                  <span>{podName(p)}</span>
                  <span className="text-sm text-emerald-200">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>
    ),
  };
  const layout = resolveLayout("today", layoutRow?.layout);

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">{firstName ? `Hi, ${firstName}` : "Welcome"}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{me.role === "coach" ? "My day" : "Today"}</h1>
        <LayoutCustomizer page="today" initial={layout} />
      </div>
      <TodaySecrets restingHr={rhrRow?.resting_hr ? Number(rhrRow.resting_hr) : null} />
      {showWelcome && <Welcome firstName={firstName} hasWatch={Boolean(device)} replay={replay === "1"} />}

      {!showWelcome && release && !seen(seenTips, release.id) && <WhatsNew id={release.id} items={me.role === "coach" ? release.coach : release.athlete} />}

      {pause && <PausedCard kind={pause.kind} since={pause.since} today={today} logged={symptomsToday ?? null} hasCoach={hasCoach} />}

      {invites.map((inv) => (
        <section key={inv.pod_id} className="mt-6 rounded-[28px] border border-amber-200/20 bg-amber-200/[0.04] p-6">
          <h2 className="text-lg font-medium">Your coach invited you to the &ldquo;{podName(inv)}&rdquo; pod</h2>
          <p className="mt-2 text-sm text-white/60">If you accept, the other members will see:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
            {SHARED_WITH_POD.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-white/60">You see what they choose to share. Your email isn&apos;t shared. You can change sharing or leave anytime.</p>
          <div className="mt-4">
            <RespondToInvite podId={inv.pod_id} />
          </div>
        </section>
      ))}

      {!device && (
        <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.06] p-6">
          <p className="text-white/70">Connect your watch so your coach can see how you&apos;re recovering.</p>
          <Link href="/connect" className="mt-3 inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-5 font-medium text-emerald-50 active:scale-95">
            Connect Garmin or Apple Watch →
          </Link>
        </section>
      )}

      {visibleSections(layout).map((k) => (
        <Fragment key={k}>{blocks[k]}</Fragment>
      ))}


      <p className="mt-10 text-xs text-white/45">Readiness compares you to your own last 28 days. Training guidance, not medical advice.</p>
    </AthleteShell>
  );
}
