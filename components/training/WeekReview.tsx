import { Bike, ChevronLeft, ChevronRight, Dumbbell, Footprints, Waves } from "lucide-react";
import Link from "next/link";

import { complianceText } from "@/lib/activity/compare";
import { addDays, familyOf, mondayOf, type Family, type SessionStatus } from "@/lib/training/week";
import type { WeekWithCompliance } from "@/lib/training/week-data";
import { formatDistance, formatDuration } from "@/lib/workouts/totals";

const FAMILY: Record<Family, { label: string; icon: typeof Bike }> = {
  run: { label: "Run", icon: Footprints },
  bike: { label: "Bike", icon: Bike },
  swim: { label: "Swim", icon: Waves },
  other: { label: "Other", icon: Dumbbell },
};

const STATUS: Record<SessionStatus, { text: string; cls: string }> = {
  done: { text: "Done", cls: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" },
  short: { text: "Cut short", cls: "border-amber-300/30 bg-amber-300/10 text-amber-100" },
  missed: { text: "Missed", cls: "border-rose-300/30 bg-rose-300/10 text-rose-100" },
  today: { text: "Today", cls: "border-white/15 bg-white/[0.06] text-white/80" },
  upcoming: { text: "Upcoming", cls: "border-white/10 text-white/50" },
};

const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

/**
 * Planned vs done for a week. `basePath` is the page it sits on (week links add ?week=…#week);
 * `workoutHref` opens a planned workout that hasn't happened yet.
 */
export default function WeekReview({
  week,
  units,
  basePath,
  workoutHref,
  you = false,
}: {
  week: WeekWithCompliance;
  units: "mi" | "km";
  basePath: string;
  workoutHref: (planId: string) => string;
  you?: boolean;
}) {
  const thisWeek = mondayOf(week.today);
  const link = (start: string) => `${basePath}${start === thisWeek ? "" : `?week=${start}`}#week`;
  const swimPool = units === "mi" ? ({ length: 25, unit: "YARD" } as const) : null;
  const dist = (m: number, f: Family) => formatDistance(m, f === "swim" ? "swim" : f, f === "swim" ? swimPool : null, units);
  const empty = !week.sessions.length && !week.extras.length;

  return (
    <section id="week" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{week.start === thisWeek ? "This week" : `Week of ${day(week.start, { month: "short", day: "numeric" })}`}</h2>
          <p className="text-xs text-white/50">
            {day(week.start, { month: "short", day: "numeric" })} – {day(week.end, { month: "short", day: "numeric" })}
            {week.due > 0 && ` · ${week.done} of ${week.due} planned ${week.due === 1 ? "session" : "sessions"} done so far`}
          </p>
        </div>
        <nav className="flex shrink-0 items-center" aria-label="Weeks">
          <Link href={link(addDays(week.start, -7))} aria-label="Previous week" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/60 hover:bg-white/[0.06]">
            <ChevronLeft size={18} />
          </Link>
          {week.start !== thisWeek && (
            <Link href={link(thisWeek)} className="flex min-h-11 items-center rounded-xl px-2 text-xs text-emerald-200 hover:bg-white/[0.06]">
              This week
            </Link>
          )}
          <Link href={link(addDays(week.start, 7))} aria-label="Next week" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/60 hover:bg-white/[0.06]">
            <ChevronRight size={18} />
          </Link>
        </nav>
      </div>

      {empty ? (
        <p className="mt-4 text-sm text-white/55">Nothing planned or done this week.</p>
      ) : (
        <>
          {week.sports.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {week.sports.map((s) => {
                const F = FAMILY[s.family];
                const pct = s.plannedSec ? Math.min(100, Math.round((s.doneSec / s.plannedSec) * 100)) : null;
                return (
                  <li key={s.family} className="rounded-2xl bg-white/[0.04] p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <F.icon size={15} className="shrink-0 text-emerald-200" aria-hidden />
                      <span className="font-medium">{F.label}</span>
                      <span className="ml-auto tabular-nums text-white/80">
                        {formatDuration(s.doneSec)}
                        {s.plannedSec > 0 && <span className="text-white/45"> / {formatDuration(s.plannedSec)}</span>}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="img" aria-label={`${pct}% of planned time`}>
                        <span className="block h-full rounded-full bg-emerald-300/70" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    {(s.doneM > 0 || s.plannedM > 0) && (
                      <p className="mt-1.5 text-xs tabular-nums text-white/55">
                        {dist(s.doneM, s.family)}
                        {s.plannedM > 0 && <span className="text-white/40"> of {dist(s.plannedM, s.family)} planned</span>}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {week.sessions.length > 0 && (
            <ol className="mt-4 divide-y divide-white/[0.08]">
              {week.sessions.map((s) => {
                const st = STATUS[s.status];
                const score = complianceText(week.compliance[s.plan.id] ?? null);
                const href = s.activity ? `/activity/${s.activity.id}` : workoutHref(s.plan.id);
                const planned = [s.plannedSec ? formatDuration(s.plannedSec) : null, s.plannedM ? dist(s.plannedM, familyOf(s.plan.sport)) : null].filter(Boolean).join(" · ");
                return (
                  <li key={s.plan.id}>
                    <Link href={href} className="-mx-2 flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.04]">
                      <span className="w-9 shrink-0 text-xs uppercase tracking-wide text-white/45">{day(s.plan.date, { weekday: "short" })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.plan.title}</span>
                        <span className="block truncate text-xs text-white/50">
                          {s.activity
                            ? [
                                s.activity.duration_s ? formatDuration(s.activity.duration_s) : null,
                                s.activity.distance_m ? dist(s.activity.distance_m, familyOf(s.activity.sport)) : null,
                                planned ? `plan ${planned.replace(" · ", ", ")}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : planned || "No set length"}
                          {score && ` · ${score}`}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${st.cls}`}>
                        {s.status === "short" && s.ratio !== null ? `${Math.round(s.ratio * 100)}%` : st.text}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {week.extras.length > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">{you ? "You also did" : "Also did"}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {week.extras.map((a) => (
                  <li key={a.id}>
                    <Link href={`/activity/${a.id}`} className="flex min-h-10 items-center rounded-full border border-white/10 px-3 text-xs text-white/70 hover:bg-white/[0.05]">
                      {FAMILY[familyOf(a.sport)].label} {a.duration_s ? formatDuration(a.duration_s) : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
