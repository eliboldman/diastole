import type { Metadata } from "next";
import Link from "next/link";

import { FLAG_ORDER, FLAG_STYLE, FlagBadge, FlagRow } from "@/components/coach/Flags";
import Sparkline, { fmt, lastNDays } from "@/components/coach/Sparkline";
import DashboardShell from "@/components/layout/DashboardShell";
import { getRoster, type AthleteSummary } from "@/lib/coach-data";
import type { Flag } from "@/lib/readiness/engine";
import { requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Today · Diastole" };

function ago(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function activityLine(a: AthleteSummary["lastActivity"], timeZone: string) {
  if (!a) return "No activities yet";
  const mins = a.duration_s ? Math.round(a.duration_s / 60) : null;
  const km = a.distance_m && a.distance_m > 100 ? `${(a.distance_m / 1000).toFixed(1)} km` : null;
  const when = new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return [cap(a.sport?.replaceAll("_", " ") ?? "Activity"), mins && `${mins} min`, km, when].filter(Boolean).join(" · ");
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function TodayPage() {
  const coach = await requireCoach();
  const roster = await getRoster(coach.id);

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
      <p className="text-sm uppercase tracking-[0.25em] text-white/35">{today}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Today</h1>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["red", "yellow", "green", "unknown"] as Flag[]).map((f) => (
          <div key={f} className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 backdrop-blur-2xl">
            <p className="text-3xl font-semibold">{counts[f]}</p>
            <div className="mt-1">
              <FlagBadge flag={f} />
            </div>
          </div>
        ))}
      </section>

      {roster.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-white/10 bg-white/[0.03] p-8 text-white/60">
          No athletes yet.{" "}
          <Link href="/athletes" className="text-emerald-200 hover:underline">
            Invite your first athlete →
          </Link>
        </div>
      ) : (
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          {sorted.map((a) => {
            const flag = flagOf(a);
            const r = a.readiness;
            return (
              <Link
                key={a.id}
                href={`/athlete/${a.id}`}
                className="group block rounded-[28px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-black/40 sm:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-semibold tracking-tight">
                      {a.name} {a.isCoach && <span className="text-sm font-normal text-white/35">(you)</span>}
                    </h2>
                    <p className="mt-1 text-xs text-white/40">
                      {a.device
                        ? `${a.device.source === "garmin" ? "Garmin" : "Apple Watch"} · synced ${ago(a.device.last_synced_at)}`
                        : "No device connected"}
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

                <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.06] pt-4">
                  <Sparkline label="HRV" points={lastNDays(a.trend, "hrv_ms")} format={fmt.hrv} />
                  <Sparkline label="Resting HR" points={lastNDays(a.trend, "resting_hr")} format={fmt.rhr} />
                  <Sparkline label="Sleep" points={lastNDays(a.trend, "sleep_seconds")} format={fmt.sleep} />
                  <Sparkline label="Stress" points={lastNDays(a.trend, "stress_avg")} format={fmt.stress} />
                </div>

                <p className="mt-4 text-xs text-white/40">Last activity: {activityLine(a.lastActivity, a.timezone)}</p>
              </Link>
            );
          })}
        </section>
      )}

      <p className="mt-10 text-xs text-white/30">
        Flags compare each athlete to their own last 28 days. Training guidance, not medical advice.
      </p>
    </DashboardShell>
  );
}
