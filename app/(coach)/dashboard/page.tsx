import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";

import { CalendarDays, CalendarRange, Plus } from "lucide-react";

import QuickLinks from "@/components/layout/QuickLinks";
import SyncedAgo from "@/components/SyncedAgo";

import AiSuggestions, { type SuggestionView } from "@/components/coach/AiSuggestions";
import { FLAG_ORDER, FLAG_STYLE, FlagBadge, FlagRow } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import DashboardShell from "@/components/layout/DashboardShell";
import { AI_MODELS, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { getRoster, type AthleteSummary } from "@/lib/coach-data";
import type { Flag } from "@/lib/readiness/engine";
import { shortDistance, type Units } from "@/lib/activity/format";
import CheckinPrompt from "@/components/avatar/CheckinPrompt";
import MorningBriefs from "@/components/coach/MorningBriefs";
import WeeklyProgress from "@/components/WeeklyProgress";
import { createClient, requireCoach } from "@/lib/supabase/server";
import type { Step } from "@/lib/workouts/garmin-format";

// Server actions on this page can run the Claude analysis (tens of seconds).
export const maxDuration = 120;

export const metadata: Metadata = { title: "Today · Diastole" };

function activityLine(a: AthleteSummary["lastActivity"], timeZone: string, units: Units) {
  if (!a) return "No activities yet";
  const mins = a.duration_s ? Math.round(a.duration_s / 60) : null;
  const km = shortDistance(a.distance_m, units, a.sport);
  const when = new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return [cap(a.sport?.replaceAll("_", " ") ?? "Activity"), mins && `${mins} min`, km, when].filter(Boolean).join(" · ");
}
function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function TodayPage() {
  const coach = await requireCoach();
  const roster = await getRoster(coach.id);

  // Coaching assistant: today's suggestions (last 2 days, so an early-morning run still shows), settings and spend.
  const supabase = await createClient();
  const since = isoDaysAgo(2);
  const [{ data: rawSuggestions }, { data: settingsRow }, spent] = await Promise.all([
    supabase
      .from("ai_suggestions")
      .select("id, athlete_id, date, overall, concern, summary, action, rationale, proposed_workout, status, planned_workouts!ai_suggestions_target_workout_id_fkey(title, scheduled_date)")
      .eq("coach_id", coach.id)
      .gte("date", since)
      .order("created_at", { ascending: false }),
    supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coach.id).maybeSingle(),
    monthToDateSpend(coach.id),
  ]);
  const ai = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) };
  const latestByAthlete = new Map<string, NonNullable<typeof rawSuggestions>[number]>();
  for (const r of rawSuggestions ?? []) if (!latestByAthlete.has(r.athlete_id)) latestByAthlete.set(r.athlete_id, r);
  const suggestions: SuggestionView[] = [...latestByAthlete.values()]
    .filter((r) => roster.some((a) => a.id === r.athlete_id)) // test-mode athletes show on /lab, not here
    .filter((r) => r.status === "pending" || r.date >= since)
    .map((r) => {
      const target = r.planned_workouts as unknown as { title: string; scheduled_date: string } | null;
      return {
        id: r.id,
        athleteId: r.athlete_id,
        athleteName: roster.find((a) => a.id === r.athlete_id)?.name ?? "Athlete",
        overall: r.overall,
        concern: r.concern,
        summary: r.summary,
        action: r.action,
        rationale: r.rationale,
        target: target ? { title: target.title, date: target.scheduled_date } : null,
        proposed: r.proposed_workout as { title: string; sport: string; scheduled_date: string; steps: Step[] } | null,
        status: r.status,
      };
    })
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

  const flagOf = (a: AthleteSummary): Flag => a.readiness?.overall ?? "unknown";
  const sorted = [...roster].sort((a, b) => FLAG_ORDER[flagOf(a)] - FLAG_ORDER[flagOf(b)] || a.name.localeCompare(b.name));
  const counts = roster.reduce<Record<Flag, number>>(
    (c, a) => ({ ...c, [flagOf(a)]: c[flagOf(a)] + 1 }),
    { red: 0, yellow: 0, green: 0, unknown: 0 },
  );
  const tone = counts.red ? "red" : counts.yellow ? "yellow" : "green";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: coach.timezone });

  return (
    <DashboardShell tone={tone}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">{today}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Today</h1>
      {/* The coach trains too: their own post-workout check */}
      <WeeklyProgress athleteId={coach.id} timeZone={coach.timezone} />
      <CheckinPrompt athleteId={coach.id} />
      <MorningBriefs coachId={coach.id} hasAthletes={roster.some((r) => r.id !== coach.id)} />
      <QuickLinks
        links={[
          { href: "/endurance-lab", label: "Build a workout", icon: <Plus size={16} aria-hidden /> },
          { href: "/calendar", label: "Calendar", icon: <CalendarRange size={16} aria-hidden /> },
          { href: "/workouts", label: "All workouts", icon: <CalendarDays size={16} aria-hidden /> },
        ]}
      />

      <section className="stagger mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["red", "yellow", "green", "unknown"] as Flag[]).map((f) => (
          <div key={f} className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-2xl">
            <p className="text-3xl font-semibold">{counts[f]}</p>
            <div className="mt-1">
              <FlagBadge flag={f} />
            </div>
          </div>
        ))}
      </section>

      <AiSuggestions
        suggestions={suggestions}
        spent={spent}
        cap={Number(ai.ai_monthly_cap_usd)}
        modelLabel={AI_MODELS[ai.ai_model as AiModel]?.label ?? ai.ai_model}
        enabled={ai.ai_enabled}
        hasKey={Boolean(process.env.ANTHROPIC_API_KEY)}
      />

      {roster.length === 0 ? (
        <div className="mt-10">
          <EmptyState emoji="🌱" title="Your roster is empty" href="/athletes" action="Invite your first athlete">
            Each athlete&apos;s readiness, training and messages land here every morning.
          </EmptyState>
        </div>
      ) : (
        <section className="stagger mt-8 grid gap-4 lg:grid-cols-2">
          {sorted.map((a) => {
            const flag = flagOf(a);
            const r = a.readiness;
            return (
              <Link
                key={a.id}
                href={`/athlete/${a.id}`}
                className="lift group block min-w-0 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl hover:bg-white/[0.075] sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight">
                      {a.name} {a.isCoach && <span className="text-sm font-normal text-white/50">(you)</span>}
                    </h2>
                    <p className="mt-1 text-xs text-white/55">
                      {a.device ? (
                        <>
                          {a.device.source === "garmin" ? "Garmin" : "Apple Watch"} · <SyncedAgo at={a.device.last_synced_at} />
                        </>
                      ) : (
                        "No device connected"
                      )}
                    </p>
                  </div>
                  <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${FLAG_STYLE[flag].dot} ${FLAG_STYLE[flag].glow}`} aria-hidden />
                </div>

                <div className="mt-3">
                  <FlagBadge flag={flag} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  {r?.note ?? (a.device ? "Waiting for first data." : "Connect a device to start.")}
                </p>

                {r && (
                  <div className="mt-4">
                    <FlagRow flags={r} />
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.09] pt-4">
                  <Sparkline label="HRV" points={lastNDays(a.trend, "hrv_ms")} format={fmt.hrv} />
                  <Sparkline label="Resting HR" points={lastNDays(a.trend, "resting_hr")} format={fmt.rhr} />
                  <Sparkline label="Sleep" points={lastNDays(a.trend, "sleep_seconds")} format={fmt.sleep} />
                  <Sparkline label="Stress" points={lastNDays(a.trend, "stress_avg")} format={fmt.stress} />
                </div>

                <p className="mt-4 text-xs text-white/55">Last activity: {activityLine(a.lastActivity, a.timezone, coach.units)}</p>
              </Link>
            );
          })}
        </section>
      )}

      <p className="mt-10 text-xs text-white/45">
        Flags compare each athlete to their own last 28 days. Training guidance, not medical advice.
      </p>
    </DashboardShell>
  );
}
