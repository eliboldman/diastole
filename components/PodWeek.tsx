import { Activity, Bike, Check, ChevronLeft, ChevronRight, Dumbbell, Footprints, Lock, Waves } from "lucide-react";
import Link from "next/link";

import { sportLabel } from "@/lib/activity/format";

export type PodWeekSession = { id: string; date: string; sport: string; title: string; minutes: number | null; start_time: string | null; done: boolean };
export type PodWeekMember = { id: string; name: string; is_me: boolean; today: string; shares: boolean; sessions: PodWeekSession[] };
export type PodWeekData = { week: string; members: PodWeekMember[] };

const ICONS = { swim: Waves, run: Footprints, bike: Bike, strength: Dumbbell, other: Activity } as const;
const kind = (sport: string): keyof typeof ICONS =>
  /swim/i.test(sport) ? "swim" : /run|walk|hik|trail|track/i.test(sport) ? "run" : /bike|cycl|ride/i.test(sport) ? "bike" : /strength|gym|yoga|mobility/i.test(sport) ? "strength" : "other";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayFmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

/** Everyone's training week in the pod: what's planned, what's done. Members who don't share show a lock. */
export default function PodWeek({ data, base, today }: { data: PodWeekData; base: string; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(data.week, i));
  const href = (w: string) => `${base}?view=week&week=${w}`;
  const thisWeek = days.includes(today);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={href(addDays(data.week, -7))} aria-label="Previous week" className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06] hover:text-white">
          <ChevronLeft size={18} />
        </Link>
        <div className="text-center">
          <p className="font-medium">{thisWeek ? "This week" : `Week of ${dayFmt(data.week, { month: "short", day: "numeric" })}`}</p>
          <p className="text-xs text-white/50">{`${dayFmt(days[0], { month: "short", day: "numeric" })} – ${dayFmt(days[6], { month: "short", day: "numeric" })}`}</p>
        </div>
        <Link href={href(addDays(data.week, 7))} aria-label="Next week" className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06] hover:text-white">
          <ChevronRight size={18} />
        </Link>
      </div>

      {data.members.length === 0 && <p className="text-center text-sm text-white/55">No one has joined this pod yet.</p>}

      <ul className="grid gap-3">
        {data.members.map((m) => {
          const first = m.is_me ? "You" : m.name.split(" ")[0];
          const due = m.sessions.filter((s) => s.date <= m.today);
          const done = m.sessions.filter((s) => s.done).length;
          return (
            <li key={m.id} className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4 backdrop-blur-xl">
              <div className="flex items-baseline justify-between gap-2">
                <Link href={`/profile/${m.id}`} className="min-w-0 truncate font-medium hover:text-emerald-100">
                  {m.is_me ? `${m.name} (you)` : m.name}
                </Link>
                {m.shares && m.sessions.length > 0 && (
                  <span className="shrink-0 text-sm tabular-nums text-white/60">{`${done} of ${m.sessions.length} done`}</span>
                )}
              </div>

              {!m.shares ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-white/50">
                  <Lock size={14} aria-hidden /> {`${first} keeps their calendar private.`}
                </p>
              ) : m.sessions.length === 0 ? (
                <p className="mt-2 text-sm text-white/50">Nothing on the calendar this week.</p>
              ) : (
                <>
                  <ol className="mt-3 grid grid-cols-7 gap-1" aria-label={`${first}'s week`}>
                    {days.map((d) => {
                      const list = m.sessions.filter((s) => s.date === d);
                      const isToday = d === m.today;
                      return (
                        <li key={d} className={`flex min-h-16 flex-col items-center gap-1 rounded-xl py-1.5 ${isToday ? "bg-white/[0.07] ring-1 ring-emerald-300/30" : ""}`}>
                          <span className={`text-[11px] ${isToday ? "text-emerald-100" : "text-white/45"}`}>{dayFmt(d, { weekday: "narrow" })}</span>
                          {list.map((s) => {
                            const Icon = ICONS[kind(s.sport)];
                            const past = s.date < m.today;
                            const state = s.done ? "done" : past ? "not logged" : "planned";
                            return (
                              <span
                                key={s.id}
                                title={`${s.title}${s.minutes ? ` · ${s.minutes} min` : ""} · ${state}`}
                                className={`relative flex h-7 w-7 items-center justify-center rounded-full ${
                                  s.done ? "bg-emerald-300 text-black" : past ? "border border-dashed border-white/20 text-white/35" : "border border-white/25 text-white/75"
                                }`}
                              >
                                <Icon size={14} aria-hidden />
                                <span className="sr-only">{`${sportLabel(s.sport)}: ${s.title}, ${state}`}</span>
                              </span>
                            );
                          })}
                        </li>
                      );
                    })}
                  </ol>
                  <details className="mt-2 group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs text-white/55 hover:text-white/80">
                      {due.length > 0 && thisWeek ? `${due.filter((s) => s.done).length} of ${due.length} done so far · sessions` : "Sessions"}
                      <ChevronRight size={14} className="ml-1 transition group-open:rotate-90" aria-hidden />
                    </summary>
                    <ul className="divide-y divide-white/[0.06]">
                      {m.sessions.map((s) => (
                        <li key={s.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            <span className="mr-2 text-white/45">{dayFmt(s.date, { weekday: "short" })}</span>
                            {s.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 tabular-nums text-white/55">
                            {s.minutes ? `${s.minutes} min` : sportLabel(s.sport)}
                            {s.done && <Check size={14} className="text-emerald-300" aria-label="done" />}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-center text-xs text-white/40">Each athlete chooses whether to share their calendar in Pods &amp; sharing.</p>
    </div>
  );
}
