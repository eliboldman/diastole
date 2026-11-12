import { ChevronRight, LogOut } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import AiSettingsForm from "@/app/(coach)/settings/AiSettingsForm";
import SettingsForm from "@/app/(coach)/settings/SettingsForm";
import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import NotifySettings from "@/components/NotifySettings";
import PodSharing from "@/components/PodSharing";
import AppearanceSettings from "@/components/AppearanceSettings";
import { cleanTabs } from "@/lib/tabs";
import ConditionsToggle from "@/components/ConditionsToggle";
import WeatherLocation from "@/components/WeatherLocation";
import TabBarSettings from "@/components/TabBarSettings";
import EggsSettings from "@/components/secrets/EggsSettings";
import { cleanEggs } from "@/lib/secrets";
import CoachingGuide from "@/components/coach/CoachingGuide";
import { asLook } from "@/lib/appearance";
import { asTheme } from "@/lib/themes";
import { asPlace } from "@/lib/weather";
import { DEFAULT_SETTINGS, monthToDateSpend } from "@/lib/ai/coach";
import { createClient, requireUser } from "@/lib/supabase/server";
import { ownedThemes } from "@/lib/grit/data";

export const metadata: Metadata = { title: "Settings · Diastole" };

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

/** Settings (from the Me tab): profile, units, pods and sharing for everyone; coaching settings and tools for coaches. */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ secret?: string }> }) {
  const { secret } = await searchParams;
  const me = await requireUser();
  const isCoach = me.role === "coach";
  const supabase = await createClient();

  const [{ data: profile }, { data: memberships }, { data: aiRow }, spent, { data: secretRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, timezone, units, share_workout_details, pod_share_level, pod_share_hrv, pod_share_sleep, pod_share_stress, notify_prefs, push_sounds, theme, appearance, weather_location, adjust_conditions, tab_bar, eggs")
      .eq("id", me.id)
      .single(),
    supabase.from("pod_members").select("pod_id, status, pods(name)").eq("athlete_id", me.id).in("status", ["invited", "active"]),
    isCoach ? supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd, philosophy").eq("coach_id", me.id).maybeSingle() : Promise.resolve({ data: null }),
    isCoach ? monthToDateSpend(me.id) : Promise.resolve(0),
    supabase.from("user_secrets").select("secret_id, enabled").eq("athlete_id", me.id),
  ]);
  const ai = { ...DEFAULT_SETTINGS, ...(aiRow ?? {}) };
  const pods = (memberships ?? []).map((m) => ({ id: m.pod_id, status: m.status, name: (m.pods as unknown as { name: string } | null)?.name ?? "Pod" }));

  return (
    <DashboardShell role={isCoach ? "coach" : "athlete"}>
      <BackLink href="/account" label="Me" />
      <h1 className="mt-4 text-4xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 truncate text-sm text-white/50">{me.email}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-4 text-lg font-medium">Profile</h2>
          <SettingsForm fullName={profile?.full_name ?? ""} timezone={profile?.timezone ?? "America/Chicago"} units={profile?.units === "km" ? "km" : "mi"} />
        </section>

        <div className="grid min-w-0 grid-cols-1 content-start gap-6">

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

          <section id="weather" className={card}>
            <h2 className="mb-1 text-lg font-medium">Weather</h2>
            <p className="mb-3 text-sm text-white/55">Where you usually train. Workouts and race day then show the forecast and what to bring for it. Just a town, never your address.</p>
            <WeatherLocation initial={asPlace(profile?.weather_location)} />
            <ConditionsToggle initial={Boolean(profile?.adjust_conditions)} />
          </section>

          <section id="tabs" className={card}>
            <h2 className="mb-1 text-lg font-medium">Bottom tabs</h2>
            <p className="mb-4 text-sm text-white/55">The places at the bottom of your screen on your phone. Pick the ones you use most.</p>
            <TabBarSettings role={isCoach ? "coach" : "athlete"} initial={cleanTabs((profile?.tab_bar as Record<string, unknown> | null)?.[isCoach ? "coach" : "athlete"], isCoach ? "coach" : "athlete")} />
          </section>

          <section id="eggs" className={card}>
            <h2 className="mb-1 text-lg font-medium">Easter eggs</h2>
            <p className="mb-3 text-sm text-white/55">Little surprises hidden around Diastole.</p>
            <EggsSettings initial={cleanEggs(profile?.eggs)} found={(secretRows ?? []).filter((r) => r.enabled).map((r) => r.secret_id)} />
          </section>

          <section id="appearance" className={card}>
            <h2 className="mb-1 text-lg font-medium">Appearance</h2>
            <p className="mb-4 text-sm text-white/55">Make Diastole yours: color, background, text size and more. Saved to your account, so it follows you to every device.</p>
            <AppearanceSettings initialTheme={asTheme(profile?.theme)} initialLook={asLook(profile?.appearance)} unlock={secret === "icarus" ? "icarus" : undefined} owned={await ownedThemes(me.id)} />
          </section>

          <section className={card}>
            <h2 className="mb-1 text-lg font-medium">Notifications</h2>
            <p className="mb-3 text-sm text-white/55">Choose what reaches your bell and your phone, and how each sounds in the Diastole app. Pick a sound to hear it.</p>
            <NotifySettings initial={(profile?.notify_prefs ?? {}) as Record<string, boolean>} coach={isCoach} sounds={(profile?.push_sounds ?? {}) as Record<string, unknown>} />
          </section>
        </div>

        {isCoach && (
          <section id="coaching" className={`${card} scroll-mt-6 lg:col-span-2`}>
            <h2 className="mb-1 text-lg font-medium">Coaching assistant</h2>
            <p className="mb-4 text-sm text-white/50">
              When you press Review on Today, athletes flagged yellow or red are reviewed by Claude, which proposes changes for you to approve. When a running-form issue shows up across
              several runs, Claude also suggests drills or library workouts. Their readiness, wellness, training and running-form data (never routes) is sent to Anthropic for
              this.
            </p>
            <AiSettingsForm enabled={ai.ai_enabled} model={ai.ai_model} cap={Number(ai.ai_monthly_cap_usd)} spent={spent} />
            <div className="mt-6 border-t border-white/10 pt-6">
              <h3 className="font-medium">Coaching guide</h3>
              <p className="mb-3 mt-1 text-sm text-white/55">Your philosophy and rules. Every suggested workout follows it. Notes about one athlete belong on that athlete&apos;s page.</p>
              <CoachingGuide initial={(aiRow as { philosophy?: string | null } | null)?.philosophy ?? ""} />
            </div>
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
