import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import CalendarAthletePicker from "@/components/CalendarAthletePicker";
import { FlagBadge } from "@/components/coach/Flags";
import CalendarBoard, { type CalItem, type Span } from "@/components/calendar/CalendarBoard";
import SpanCookie from "@/components/calendar/SpanCookie";
import { addDays, dayIn, monthGrid, monthKey, parseMonth, shiftMonth } from "@/lib/calendar";
import type { Flag } from "@/lib/readiness/engine";
import { shortDistance, sportLabel } from "@/lib/activity/format";
import WorkoutPeek, { type Peek } from "@/components/calendar/WorkoutPeek";
import { PEEK_COLUMNS, toPeek, type PeekRow } from "@/lib/workouts/peek";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Calendar · Diastole" };

type Search = { month?: string; day?: string; athlete?: string; span?: string; start?: string };

type Planned = PeekRow;
type Done = { id: string; athlete_id: string; sport: string | null; start_time: string; duration_s: number | null; distance_m: number | null; avg_hr: number | null; planned_workout_id: string | null };

const SPANS: { key: Span; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "2weeks", label: "2 weeks" },
  { key: "month", label: "Month" },
];
const isDate = (v?: string) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "");
const sunday = (d: string) => addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replaceAll("_", " ");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const isCoach = me.role === "coach";
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });

  // Month, or one or two weeks at a time. The last choice is remembered (SpanCookie).
  const remembered = (await cookies()).get("cal_span")?.value;
  const span: Span = SPANS.some((x) => x.key === sp.span) ? (sp.span as Span) : SPANS.some((x) => x.key === remembered) ? (remembered as Span) : "month";
  const weeksIn = span === "week" ? 1 : 2;

  let month = parseMonth(sp.month, today);
  let grid: string[][];
  if (span === "month") {
    grid = monthGrid(month);
  } else {
    const first = sunday(isDate(sp.start) ? sp.start! : isDate(sp.day) ? sp.day! : sp.month ? `${monthKey(month)}-01` : today);
    grid = Array.from({ length: weeksIn }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
    month = parseMonth(grid[0][0].slice(0, 7), today);
  }
  const from = grid[0][0];
  const to = grid.at(-1)!.at(-1)!;
  const inMonth = (d: string) => d.slice(0, 7) === monthKey(month);
  const inRange = (d: string) => d >= from && d <= to;
  const selected = isDate(sp.day) && inRange(sp.day!) ? sp.day! : inRange(today) && (span !== "month" || inMonth(today)) ? today : span === "month" ? grid[0].find(inMonth)! : from;

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
          .select(PEEK_COLUMNS)
          .in("athlete_id", ids)
          .is("deleted_at", null)
          .gte("scheduled_date", from)
          .lte("scheduled_date", to)
          .order("scheduled_date")
          .limit(1000),
        supabase
          .from("activities")
          .select("id, athlete_id, sport, start_time, duration_s, distance_m, avg_hr, planned_workout_id")
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
    const anchor = span === "month" ? { month: monthKey(month) } : { start: from };
    const next = { span, ...anchor, athlete: focus && isCoach ? focus : undefined, ...q };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return `/calendar?${p}`;
  };

  const dayPlanned = plannedBy.get(selected) ?? [];
  const dayDone = doneBy.get(selected) ?? [];
  const linked = new Set(dayDone.map((a) => a.planned_workout_id).filter(Boolean));

  // What the bubble shows for each planned session. A sealed mystery stays sealed for the athlete (coaches wrote it, so they see it).
  const peeks: Peek[] = dayPlanned.map((w) =>
    toPeek(w, { coach: isCoach, done: w.status === "completed" || linked.has(w.id), units: me.units === "km" ? "km" : "mi", who: isCoach && !focus ? nameOf(w.athlete_id) : undefined }),
  );
  const md = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  const title =
    span === "month"
      ? new Date(Date.UTC(month.year, month.month - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : `${md(from, { month: "short", day: "numeric" })} – ${md(to, { month: from.slice(0, 7) === to.slice(0, 7) ? undefined : "short", day: "numeric" })}, ${to.slice(0, 4)}`;
  const step = (n: number) => (span === "month" ? { month: monthKey(shiftMonth(month, n)), day: undefined } : { start: addDays(from, n * 7 * weeksIn), day: undefined });
  const switchTo = (k: Span) => (k === "month" ? { span: k, month: selected.slice(0, 7), start: undefined, day: selected } : { span: k, start: sunday(selected), month: undefined, day: selected });

  // Everything the grid shows, with the bubble's contents for planned sessions.
  const units = me.units === "km" ? "km" : "mi";
  const prefix = (id: string) => (isCoach && !focus ? `${nameOf(id)} · ` : "");
  const calItems: CalItem[] = [];
  for (const [d, ws] of plannedBy) {
    const doneHere = doneBy.get(d) ?? [];
    for (const w of ws) {
      const done = w.status === "completed" || doneHere.some((x) => x.planned_workout_id === w.id);
      const peek = toPeek(w, { coach: isCoach, done, units, who: isCoach && !focus ? nameOf(w.athlete_id) : undefined });
      calItems.push({
        kind: "plan", id: w.id, day: d, done,
        text: `${prefix(w.athlete_id)}${peek.title}`,
        sub: [peek.sport, peek.minutes && `${peek.minutes} min`, w.status === "draft" && "draft"].filter(Boolean).join(" · "),
        movable: isCoach && !done,
        peek,
      });
    }
  }
  for (const [d, as] of doneBy) {
    for (const a of as) {
      calItems.push({
        kind: "done", id: a.id, day: d, href: `/activity/${a.id}`,
        text: `${prefix(a.athlete_id)}${a.sport ? sportLabel(a.sport) : "Activity"}`,
        sub: [a.duration_s && `${Math.round(a.duration_s / 60)} min`, shortDistance(a.distance_m, me.units, a.sport)].filter(Boolean).join(" · "),
      });
    }
  }
  const dayBase = href({ day: "DAY" }).replace("DAY", "");

  return (
    <AthleteShell isCoach={isCoach}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Calendar</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href(step(-1))} aria-label={span === "month" ? "Previous month" : "Earlier"} scroll={false} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09]">
            <ChevronLeft size={18} />
          </Link>
          <Link href={href(span === "month" ? { month: today.slice(0, 7), day: today } : { start: sunday(today), day: today })} scroll={false} className="flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm active:scale-95 hover:bg-white/[0.09]">
            Today
          </Link>
          <Link href={href(step(1))} aria-label={span === "month" ? "Next month" : "Later"} scroll={false} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09]">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      <SpanCookie span={sp.span && span === sp.span ? span : null} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <nav aria-label="Calendar range" className="flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {SPANS.map((x) => (
            <Link
              key={x.key}
              href={href(switchTo(x.key))}
              scroll={false}
              aria-current={span === x.key ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-xl px-3.5 text-sm transition ${span === x.key ? "bg-emerald-300 font-semibold text-emerald-950" : "text-white/65 hover:text-white"}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        {isCoach && <CalendarAthletePicker athletes={roster} value={focus ?? ""} query={span === "month" ? `span=month&month=${monthKey(month)}` : `span=${span}&start=${from}`} />}
      </div>

      {isCoach && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link href="/team-calendar" className="inline-flex min-h-11 items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.08] px-4 text-sm text-emerald-100 hover:bg-emerald-300/[0.14]">
            Team week: drag to move →
          </Link>
        </div>
      )}

      <CalendarBoard
        key={`${from}:${focus ?? ""}`}
        weeks={grid}
        span={span}
        today={today}
        selected={selected}
        month={span === "month" ? monthKey(month) : null}
        items={calItems}
        flags={Object.fromEntries(flagBy)}
        dayHref={dayBase}
      />

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
            {peeks.map((w) => (
              <WorkoutPeek key={w.id} w={w} />
            ))}
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
                      shortDistance(a.distance_m, me.units, a.sport),
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
