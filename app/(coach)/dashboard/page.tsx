import { inboxCount } from "@/lib/inbox/data";
import { ensureDemoForNewCoach } from "@/lib/demo/demo-athlete";
import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";

import { CalendarRange, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Shuffle, Sun, type LucideIcon } from "lucide-react";

import SyncedAgo from "@/components/SyncedAgo";

import AiSuggestions, { type SuggestionView } from "@/components/coach/AiSuggestions";
import { FLAG_ORDER, FLAG_STYLE } from "@/components/coach/Flags";
import ChangeOfPlans from "@/components/coach/ChangeOfPlans";
import Spotlight from "@/components/Spotlight";
import WhatsNew from "@/components/WhatsNew";
import { latestRelease, seen, TIPS } from "@/lib/discovery";
import WorkoutRequests from "@/components/coach/WorkoutRequests";
import YouToday from "@/components/coach/YouToday";
import PlanChanges from "@/components/coach/PlanChanges";
import DashboardShell from "@/components/layout/DashboardShell";
import { AI_MODELS, DEFAULT_SETTINGS, monthToDateSpend, type AiModel } from "@/lib/ai/coach";
import { getRoster, type AthleteSummary } from "@/lib/coach-data";
import type { Flag } from "@/lib/readiness/engine";
import { shortDistance, type Units } from "@/lib/activity/format";
import CheckinPrompt from "@/components/avatar/CheckinPrompt";
import MorningBriefs from "@/components/coach/MorningBriefs";
import MorningReview from "@/components/coach/MorningReview";
import { getMorningStatus } from "@/lib/ai/morning-status";
import ZoneSuggestions from "@/components/coach/ZoneSuggestions";
import BossReview from "@/components/bosses/BossReview";
import { getZoneSuggestions } from "@/lib/training/zone-suggest-data";
import SafetyNotes from "@/components/coach/SafetyNotes";
import { WatchCard } from "@/components/coach/WatchStatus";
import { getWatchStatuses } from "@/lib/devices/status-data";
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
  await ensureDemoForNewCoach(coach.id);
  const roster = await getRoster(coach.id);
  const waiting = await inboxCount(await createClient(), coach.id).catch(() => 0);

  // Coaching assistant: today's suggestions (last 2 days, so an early-morning run still shows), settings and spend.
  const supabase = await createClient();
  const since = isoDaysAgo(2);
  const watchIds = roster.map((r) => r.id);
  const [{ data: rawSuggestions }, { data: settingsRow }, spent, watches, morning, zoneSugg] = await Promise.all([
    supabase
      .from("ai_suggestions")
      .select("id, athlete_id, date, overall, concern, summary, action, rationale, proposed_workout, status, planned_workouts!ai_suggestions_target_workout_id_fkey(title, scheduled_date)")
      .eq("coach_id", coach.id)
      .gte("date", since)
      .order("created_at", { ascending: false }),
    supabase.from("coach_settings").select("ai_enabled, ai_model, ai_monthly_cap_usd").eq("coach_id", coach.id).maybeSingle(),
    monthToDateSpend(coach.id),
    getWatchStatuses(supabase, watchIds),
    getMorningStatus(coach.id),
    getZoneSuggestions(supabase, watchIds),
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
  const { data: prof } = await supabase.from("profiles").select("seen_tips").eq("id", coach.id).maybeSingle();
  const release = latestRelease();

  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const firstName = (r: AthleteSummary) => (r.id === coach.id ? "You" : r.name.split(" ")[0] || "Athlete");
  const watchProblems = roster.map((r) => ({ id: r.id, name: firstName(r), status: watches.get(r.id)! })).filter((r) => r.status?.state === "attention");
  const summary = (["red", "yellow", "green", "unknown"] as Flag[]).filter((f) => counts[f]).map((f) => `${counts[f]} ${FLAG_STYLE[f].label.toLowerCase()}`).join(" · ");

  return (
    <DashboardShell tone={tone}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">{today}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Today</h1>
        {waiting > 0 && (
          <Link href="/inbox" className="flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/[0.10] px-4 text-sm font-medium text-amber-50 transition active:scale-95 hover:bg-amber-300/[0.16]">
            {waiting} waiting on you →
          </Link>
        )}
      </div>

      {/* One prompt at most: the next one shows once this one is done or dismissed. */}
      <div className="[&>:empty]:hidden [&>:not(:empty)~*]:hidden">
        <div>{release && !seen(prof?.seen_tips, release.id) && <WhatsNew id={release.id} items={release.coach} />}</div>
        <div><CheckinPrompt athleteId={coach.id} /></div>
        <div><Spotlight tip={TIPS.changeOfPlans} seen={seen(prof?.seen_tips, TIPS.changeOfPlans.id)} /></div>
      </div>

      {/* Your own day, for coaches who train too. */}
      <YouToday coachId={coach.id} coachOfSelf={roster.some((r) => r.id === coach.id)} today={todayIso} timeZone={coach.timezone} units={coach.units === "km" ? "km" : "mi"} />

      {/* Needs you: each card only shows when there's something to act on. */}
      <div className="[&:has(.needs>:not(:empty))_.all-clear]:hidden">
        <div className="needs [&>:empty]:hidden">
          <div><SafetyNotes /></div>
          <div><PlanChanges coachId={coach.id} /></div>
          <div><WorkoutRequests coachId={coach.id} units={coach.units === "km" ? "km" : "mi"} /></div>
          <div>{ai.ai_enabled && <MorningReview status={morning} />}</div>
          <div><MorningBriefs coachId={coach.id} hasAthletes={roster.some((r) => r.id !== coach.id)} /></div>
          <div>
            {suggestions.length > 0 && (
              <AiSuggestions
                suggestions={suggestions}
                spent={spent}
                cap={Number(ai.ai_monthly_cap_usd)}
                modelLabel={AI_MODELS[ai.ai_model as AiModel]?.label ?? ai.ai_model}
                enabled={ai.ai_enabled}
                hasKey={Boolean(process.env.ANTHROPIC_API_KEY)}
              />
            )}
          </div>
          <div><BossReview coachId={coach.id} today={todayIso} names={Object.fromEntries(roster.map((r) => [r.id, firstName(r)]))} /></div>
          <div><ZoneSuggestions units={coach.units === "km" ? "km" : "mi"} rows={roster.filter((r) => zoneSugg.has(r.id)).map((r) => ({ athleteId: r.id, name: firstName(r), suggestions: zoneSugg.get(r.id)! }))} /></div>
          <div><WatchCard rows={watchProblems} /></div>
        </div>
        {roster.length > 0 && (
          <p className="all-clear mt-6 flex items-center gap-2 rounded-[24px] border border-emerald-300/15 bg-emerald-300/[0.05] p-5 text-sm text-emerald-50/85">
            <CheckCircle2 size={18} className="shrink-0 text-emerald-200" aria-hidden /> Nothing needs you right now.
          </p>
        )}
      </div>

      {/* Change of plans: tucked away until needed */}
      <details className="group mt-6 rounded-[24px] border border-white/10 bg-white/[0.03]">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm text-white/75 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Shuffle size={16} className="text-emerald-200/80" aria-hidden /> Something changed? Move or swap a workout</span>
          <ChevronDown size={16} className="transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-5 pb-5">
          <ChangeOfPlans today={todayIso} />
        </div>
      </details>

      {roster.length === 0 ? (
        <div className="mt-10">
          <EmptyState emoji="🌱" title="Your roster is empty" href="/athletes" action="Invite your first athlete">
            Each athlete&apos;s readiness, training and messages land here every morning.
          </EmptyState>
        </div>
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium">Athletes</h2>
            <p className="text-sm text-white/55">{summary}</p>
          </div>
          <ul className="stagger grid gap-2 lg:grid-cols-2">
            {sorted.map((a) => {
              const flag = flagOf(a);
              return (
                <li key={a.id}>
                  <Link href={`/athlete/${a.id}`} className="lift flex min-w-0 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.07]">
                    <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${FLAG_STYLE[flag].dot} ${FLAG_STYLE[flag].glow}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">
                          {a.name} {a.isCoach && <span className="text-sm font-normal text-white/50">(you)</span>}
                        </span>
                        <span className={`shrink-0 text-xs ${FLAG_STYLE[flag].text}`}>{FLAG_STYLE[flag].label}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-white/60">
                        {a.readiness?.note ?? (a.device ? "Waiting for first data." : "Connect a device to start.")}
                      </span>
                      <span className="mt-1 block truncate text-xs text-white/45">
                        {activityLine(a.lastActivity, a.timezone, coach.units)}
                        {a.device ? <> · <SyncedAgo at={a.device.last_synced_at} /></> : " · No device"}
                      </span>
                    </span>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-white/35" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <nav aria-label="Shortcuts" className="mt-8 grid grid-cols-3 gap-2">
        {SHORTCUTS.map((t) => (
          <Link key={t.href} href={t.href} className="lift flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] text-xs text-white/70 hover:bg-white/[0.06]">
            <t.icon size={18} className="text-emerald-200/80" aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>

      <p className="mt-10 text-xs text-white/45">
        Flags compare each athlete to their own last 28 days. Training guidance, not medical advice.
      </p>
    </DashboardShell>
  );
}

// Only places the menus don't already cover (workouts and the builder live under the Lab tab).
const SHORTCUTS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "My day", href: "/me", icon: Sun },
  { label: "Calendar", href: "/calendar", icon: CalendarRange },
  { label: "Weekly digest", href: "/digest", icon: ClipboardList },
];
