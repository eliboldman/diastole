import { ChevronRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import AiSettingsForm from "@/app/(coach)/settings/AiSettingsForm";
import SettingsForm from "@/app/(coach)/settings/SettingsForm";
import Avatar from "@/components/avatar/Avatar";
import DashboardShell from "@/components/layout/DashboardShell";
import NotifySettings from "@/components/NotifySettings";
import PodSharing from "@/components/PodSharing";
import SyncedAgo from "@/components/SyncedAgo";
import { DEFAULT_SETTINGS, monthToDateSpend } from "@/lib/ai/coach";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Me · Diastole" };

const card = "rounded-[28px] border border-white/10 bg-white/[0.06] p-6 backdrop-blur-2xl";
const row = "lift flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm";

function Row({ href, children, sub }: { href: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <Link href={href} className={row}>
      <span className="min-w-0">
        <span className="block truncate">{children}</span>
        {sub && <span className="block truncate text-xs text-white/45">{sub}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
    </Link>
  );
}

/** "Me": profile, units, watch, pods and sharing for everyone; coaching settings and tools for coaches. */
export default async function AccountPage() {
  const me = await requireUser();
  const isCoach = me.role === "coach";
  const supabase = await createClient();

  const [{ data: profile }, { data: device }, { data: memberships }, { data: aiRow }, spent, { data: avatar }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, timezone, units, share_workout_details, pod_share_level, pod_share_hrv, pod_share_sleep, pod_share_stress, notify_prefs, push_sounds")
      .eq("id", me.id)
      .single(),
    supabase.from("device_connections").select("source, last_synced_at").eq("athlete_id", me.id).maybeSingle(),
    supabase.from("pod_members").select("pod_id, status, pods(name)").eq("athlete_id", me.id).in("status", ["invited", "active"]),
    isCoach ? supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", me.id).maybeSingle() : Promise.resolve({ data: null }),
    isCoach ? monthToDateSpend(me.id) : Promise.resolve(0),
    supabase.from("avatars").select("look").eq("athlete_id", me.id).maybeSingle(),
  ]);
  const ai = { ...DEFAULT_SETTINGS, ...(aiRow ?? {}) };
  const pods = (memberships ?? []).map((m) => ({ id: m.pod_id, status: m.status, name: (m.pods as unknown as { name: string } | null)?.name ?? "Pod" }));

  return (
    <DashboardShell role={isCoach ? "coach" : "athlete"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Account</p>
      <h1 className="mt-3 break-words text-4xl font-bold tracking-tight">{profile?.full_name || "Me"}</h1>
      <p className="mt-1 truncate text-sm text-white/50">{me.email}</p>

      {/* The avatar and metrics page: the one obvious thing to open here */}
      <Link
        href={`/profile/${me.id}`}
        className="lift mt-6 flex items-center gap-4 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.05] p-3 pr-5 backdrop-blur-xl"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/10">
          <Avatar look={avatar?.look ?? null} variant="bust" className="h-16 w-16" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{avatar ? "Your avatar and metrics" : "Create your avatar"}</span>
          <span className="block truncate text-sm text-white/55">FTP, threshold pace, PRs, streaks and today&apos;s readiness</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-emerald-200" aria-hidden />
      </Link>

      {/* Coaches train too: everything an athlete has, one tap away, without a second account */}
      {isCoach && (
        <section className={`${card} mt-6`}>
          <h2 className="mb-1 text-lg font-medium">Your own training</h2>
          <p className="mb-4 text-sm text-white/55">Everything your athletes see, for you.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Row href="/me" sub="Readiness, next workouts, check-ins">
              My day
            </Row>
            <Row href="/training" sub="Your planned and past workouts">
              My training
            </Row>
            <Row href="/fuel" sub="Workout fueling and fuel days">
              My fuel
            </Row>
            <Row href="/races" sub="Race plans and fueling tools">
              My races
            </Row>
            <Row href="/me/pods" sub="Pods you train in">
              My pods
            </Row>
          </div>
        </section>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-4 text-lg font-medium">Profile</h2>
          <SettingsForm fullName={profile?.full_name ?? ""} timezone={profile?.timezone ?? "America/Chicago"} units={profile?.units === "km" ? "km" : "mi"} />
        </section>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">
          <section className={card}>
            <h2 className="mb-1 text-lg font-medium">Watch</h2>
            <p className="mb-4 text-sm text-white/55">
              {device ? (
                <>
                  {device.source === "garmin" ? "Garmin" : "Apple Watch"} connected · <SyncedAgo at={device.last_synced_at} />
                </>
              ) : (
                "No watch connected yet."
              )}
            </p>
            <div className="grid gap-2">
              <Row href="/connect">{device ? "Manage watch connection" : "Connect Garmin or Apple Watch"}</Row>
              {device?.source === "garmin" && (
                <Row href="/me/import" sub="Past months of health data, plus charts and laps for past workouts">
                  Import Garmin history
                </Row>
              )}
              <Row href="/me/upload" sub="Rouvy, Zwift and other workouts that don't sync on their own">
                Upload a workout file
              </Row>
            </div>
          </section>

          <section className={card}>
            <h2 className="mb-4 text-lg font-medium">Pods</h2>
            {pods.length === 0 ? (
              <p className="text-sm text-white/55">{isCoach ? "You coach pods; you're not a member of one." : "You're not in a pod yet. Your coach sets them up."}</p>
            ) : (
              <div className="grid gap-2">
                {pods.map((p) => (
                  <Row key={p.id} href={p.status === "invited" ? "/me/pods" : `/me/pods/${p.id}`} sub={p.status === "invited" ? "Invitation waiting" : undefined}>
                    {p.name}
                  </Row>
                ))}
              </div>
            )}
            {pods.some((p) => p.status === "active") && (
              <div className="mt-5 border-t border-white/10 pt-5">
                <PodSharing
                  initial={{
                    level: (profile?.pod_share_level ?? 0) as 0 | 1 | 2,
                    details: Boolean(profile?.share_workout_details),
                    hrv: Boolean(profile?.pod_share_hrv),
                    sleep: Boolean(profile?.pod_share_sleep),
                    stress: Boolean(profile?.pod_share_stress),
                  }}
                />
              </div>
            )}
            {isCoach && (
              <div className="mt-4">
                <Row href="/pods">Manage your pods</Row>
              </div>
            )}
          </section>

          <section className={card}>
            <h2 className="mb-1 text-lg font-medium">Notifications</h2>
            <p className="mb-3 text-sm text-white/55">Choose what reaches your bell and your phone, and how each sounds in the Diastole app. Pick a sound to hear it.</p>
            <NotifySettings initial={(profile?.notify_prefs ?? {}) as Record<string, boolean>} coach={isCoach} sounds={(profile?.push_sounds ?? {}) as Record<string, unknown>} />
          </section>
        </div>

        {isCoach && (
          <section className={`${card} lg:col-span-2`}>
            <h2 className="mb-1 text-lg font-medium">Coaching assistant</h2>
            <p className="mb-4 text-sm text-white/50">
              Each morning, athletes flagged yellow or red are reviewed by Claude, which proposes changes for you to approve. When a running-form issue shows up across
              several runs, Claude also suggests drills or library workouts. Their readiness, wellness, training and running-form data (never routes) is sent to Anthropic for
              this.
            </p>
            <AiSettingsForm enabled={ai.ai_enabled} model={ai.ai_model} cap={Number(ai.ai_monthly_cap_usd)} spent={spent} />
          </section>
        )}

        {isCoach && (
          <section className={`${card} lg:col-span-2`}>
            <h2 className="mb-4 text-lg font-medium">Coach tools</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Row href="/garmin-log" sub="Every push Garmin sends">
                Garmin deliveries
              </Row>
              <Row href="/lab" sub="Fake athletes for trying the AI">
                AI test mode
              </Row>
            </div>
          </section>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <form action="/auth/signout" method="post">
          <button className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/15 px-5 text-sm text-white/75 hover:bg-white/[0.06]">
            <LogOut size={16} aria-hidden /> Sign out
          </button>
        </form>
        <Link href="/me?welcome=1" className="text-sm text-white/45 hover:text-white">
          Replay the welcome tour
        </Link>
        <Link href="/privacy" className="text-sm text-white/45 hover:text-white">
          Privacy policy
        </Link>
      </div>
    </DashboardShell>
  );
}
