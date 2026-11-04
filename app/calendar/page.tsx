import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import CalendarAthletePicker from "@/components/CalendarAthletePicker";
import { FLAG_STYLE, FlagBadge } from "@/components/coach/Flags";
import { addDays, dayIn, monthGrid, monthKey, parseMonth, shiftMonth } from "@/lib/calendar";
import type { Flag } from "@/lib/readiness/engine";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar · Diastole" };

type Search = { month?: string; day?: string; athlete?: string };

type Planned = { id: string; athlete_id: string; scheduled_date: string; title: string; sport: string; status: string; description: string | null };
type Done = { id: string; athlete_id: string; sport: string | null; start_time: string; duration_s: number | null; distance_m: number | null; avg_hr: number | null };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replaceAll("_", " ");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const isCoach = me.role === "coach";
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });

  const month = parseMonth(sp.month, today);
  const grid = monthGrid(month);
  const from = grid[0][0];
  const to = grid.at(-1)!.at(-1)!;
  const inMonth = (d: string) => d.slice(0, 7) === monthKey(month);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") && sp.day! >= from && sp.day! <= to ? sp.day! : inMonth(today) ? today : grid[0].find(inMonth)!;

  // Whose calendar: an athlete sees their own; a coach sees everyone, or one athlete.
  let roster: { id: string; name: string }[] = [];
  if (isCoach) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").eq("coach_id", me.id).eq("is_test", false).order("full_name");
    roster = (data ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email || "Athlete" }));
  }
  const focus = isCoach ? roster.find((r) => r.id === sp.athlete)?.id ?? null : me.id;
  const ids = focus ? [focus] : roster.map((r) => r.id);
  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name.split(" ")[0] ?? "";

  // Activities are stored in UTC; widen by a day each side, then bucket by the viewer's local day.
  const [{ data: planned }, { data: done }, { data: readiness }] = ids.length
    ? await Promise.all([
        supabase
          .from("planned_workouts")
          .select("id, athlete_id, scheduled_date, title, sport, status, description")
          .in("athlete_id", ids)
          .is("deleted_at", null)
          .gte("scheduled_date", from)
          .lte("scheduled_date", to)
          .order("scheduled_date")
          .limit(1000),
        supabase
          .from("activities")
          .select("id, athlete_id, sport, start_time, duration_s, distance_m, avg_hr")
          .in("athlete_id", ids)
          .gte("start_time", `${addDays(from, -1)}T00:00:00Z`)
          .lte("start_time", `${addDays(to, 1)}T23:59:59Z`)
          .order("start_time")
          .limit(2000),
        focus
          ? supabase.from("readiness_scores").select("date, overall").eq("athlete_id", focus).gte("date", from).lte("date", to)
          : Promise.resolve({ data: [] as { date: string; overall: Flag }[] }),
      ])
    : [{ data: [] as Planned[] }, { data: [] as Done[] }, { data: [] as { date: string; overall: Flag }[] }];

  const plannedBy = new Map<string, Planned[]>();
  for (const p of (planned ?? []) as Planned[]) {
    if (!isCoach && p.status === "draft") continue;
    plannedBy.set(p.scheduled_date, [...(plannedBy.get(p.scheduled_date) ?? []), p]);
  }
  const doneBy = new Map<string, Done[]>();
  for (const a of (done ?? []) as Done[]) {
    const d = dayIn(a.start_time, me.timezone);
    doneBy.set(d, [...(doneBy.get(d) ?? []), a]);
  }
  const flagBy = new Map((readiness ?? []).map((r) => [r.date, r.overall as Flag]));

  const href = (q: Partial<Search>) => {
    const p = new URLSearchParams();
    const next = { month: monthKey(month), athlete: focus && isCoach ? focus : undefined, ...q };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/calendar?${p}`;
  };

  const dayPlanned = plannedBy.get(selected) ?? [];
  const dayDone = doneBy.get(selected) ?? [];
  const title = new Date(Date.UTC(month.year, month.month - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <AthleteShell isCoach={isCoach}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Calendar</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href({ month: monthKey(shiftMonth(month, -1)), day: undefined })} aria-label="Previous month" scroll={false} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09]">
            <ChevronLeft size={18} />
          </Link>
          <Link href={href({ month: today.slice(0, 7), day: today })} scroll={false} className="flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm active:scale-95 hover:bg-white/[0.09]">
            Today
          </Link>
          <Link href={href({ month: monthKey(shiftMonth(month, 1)), day: undefined })} aria-label="Next month" scroll={false} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09]">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      {isCoach && (
        <div className="mt-5">
          <CalendarAthletePicker athletes={roster} value={focus ?? ""} month={monthKey(month)} />
        </div>
      )}

      <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-2 backdrop-blur-xl sm:p-3">
        <div className="grid grid-cols-7 pb-1 text-center text-[11px] uppercase tracking-wider text-white/45">
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </span>
          ))}
        </div>
        <div className="grid gap-1">
          {grid.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-1">
              {week.map((d) => {
                const p = plannedBy.get(d) ?? [];
                const a = doneBy.get(d) ?? [];
                const flag = flagBy.get(d);
                const isSel = d === selected;
                const isToday = d === today;
                const items = [
                  ...p.map((w) => ({ key: w.id, text: `${isCoach && !focus ? `${nameOf(w.athlete_id)} · ` : ""}${w.title}`, kind: w.status === "completed" ? "done" : "plan" })),
                  ...a.map((x) => ({ key: x.id, text: `${isCoach && !focus ? `${nameOf(x.athlete_id)} · ` : ""}${cap(x.sport ?? "activity")}`, kind: "done" })),
                ];
                return (
                  <Link
                    key={d}
                    href={href({ day: d })}
                    scroll={false}
                    aria-current={isSel ? "date" : undefined}
                    className={`group relative flex min-h-14 flex-col rounded-2xl border p-1.5 text-left transition active:scale-95 sm:min-h-24 sm:p-2 ${
                      isSel ? "border-emerald-300/40 bg-emerald-300/[0.09]" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                    } ${inMonth(d) ? "" : "opacity-35"}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? "bg-emerald-300 font-semibold text-emerald-950" : "text-white/70"}`}>
                        {+d.slice(8)}
                      </span>
                      {flag && flag !== "unknown" && <span className={`h-2 w-2 rounded-full ${FLAG_STYLE[flag].dot}`} title={FLAG_STYLE[flag].label} />}
                    </span>
                    {/* Phone: dots. Larger screens: titles. */}
                    <span className="mt-auto flex flex-wrap gap-0.5 pt-1 sm:hidden">
                      {items.slice(0, 4).map((i) => (
                        <span key={i.key} className={`h-1.5 w-1.5 rounded-full ${i.kind === "plan" ? "border border-emerald-200/80" : "bg-white/70"}`} />
                      ))}
                    </span>
                    <span className="mt-1 hidden min-w-0 gap-0.5 sm:grid">
                      {items.slice(0, 3).map((i) => (
                        <span
                          key={i.key}
                          className={`truncate rounded-md px-1.5 py-0.5 text-[11px] ${i.kind === "plan" ? "border border-emerald-300/25 text-emerald-100" : "bg-white/[0.08] text-white/75"}`}
                        >
                          {i.text}
                        </span>
                      ))}
                      {items.length > 3 && <span className="px-1 text-[11px] text-white/45">+{items.length - 3} more</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 px-2 pt-3 pb-1 text-[11px] text-white/50">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-emerald-200/80" /> Planned</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/70" /> Completed</span>
          {focus && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Readiness</span>}
        </div>
      </div>

      <section key={selected} className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">
            {new Date(`${selected}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
          </h2>
          {flagBy.get(selected) && <FlagBadge flag={flagBy.get(selected)!} />}
        </div>

        {!dayPlanned.length && !dayDone.length ? (
          <p className="mt-3 text-sm text-white/55">{selected > today ? "Nothing planned yet." : "Rest day. Nothing planned or recorded."}</p>
        ) : (
          <ul className="stagger mt-4 grid gap-2">
            {dayPlanned.map((w) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {isCoach && !focus && <span className="text-white/55">{nameOf(w.athlete_id)} · </span>}
                      {w.title}
                    </span>
                    {w.description && <span className="mt-0.5 block text-sm text-white/55">{w.description}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${w.status === "completed" ? "border-white/10 bg-white/[0.08] text-white/70" : "border-emerald-300/25 text-emerald-100"}`}>
                    {w.status === "draft" ? "Draft" : w.status === "completed" ? "Done" : "Planned"}
                  </span>
                </>
              );
              const cls = "flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4";
              return (
                <li key={w.id}>
                  {isCoach ? (
                    <Link href={`/athlete/${w.athlete_id}/workouts/${w.id}`} className={`${cls} lift`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
            {dayDone.map((a) => (
              <li key={a.id}>
                <Link href={`/activity/${a.id}`} className="lift flex items-center justify-between gap-3 rounded-2xl bg-white/[0.06] p-4">
                <span>
                  <span className="block font-medium">
                    {isCoach && !focus && <span className="text-white/55">{nameOf(a.athlete_id)} · </span>}
                    {cap(a.sport ?? "activity")}
                  </span>
                  <span className="text-sm text-white/55">
                    {[
                      new Date(a.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: me.timezone }),
                      a.duration_s && `${Math.round(a.duration_s / 60)} min`,
                      a.distance_m && a.distance_m > 100 && `${(a.distance_m / 1000).toFixed(1)} km`,
                      a.avg_hr && `${Math.round(a.avg_hr)} bpm avg`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wider text-white/50">Completed</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AthleteShell>
  );
}
