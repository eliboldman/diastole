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
import WorkoutPeek, { type Actual, type Peek } from "@/components/calendar/WorkoutPeek";
import { sportGroup } from "@/lib/pod-stickers";
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

  let month = parseMonth(sp.month ?? (isDate(sp.day) ? sp.day!.slice(0, 7) : undefined), today);
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

  const md = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
  const title =
    span === "month"
      ? new Date(Date.UTC(month.year, month.month - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
      : (
          <>
            {md(from, { month: "short", day: "numeric" })} – {md(to, { month: from.slice(0, 7) === to.slice(0, 7) ? undefined : "short", day: "numeric" })}
            <span className="hidden sm:inline">, {to.slice(0, 4)}</span>
          </>
        );
  const step = (n: number) => (span === "month" ? { month: monthKey(shiftMonth(month, n)), day: undefined } : { start: addDays(from, n * 7 * weeksIn), day: undefined });
  const switchTo = (k: Span) => (k === "month" ? { span: k, month: selected.slice(0, 7), start: undefined, day: selected } : { span: k, start: sunday(selected), month: undefined, day: selected });

  // Everything the grid shows. A finished activity joins the planned session it belongs to (its link,
  // or the same athlete, day and sport), so each session is one item; activities with no plan stand alone.
  const units = me.units === "km" ? "km" : "mi";
  const prefix = (id: string) => (isCoach && !focus ? nameOf(id) : "");
  const allDone = (done ?? []) as Done[];
  const used = new Set<string>();
  const actual = (a: Done): Actual => {
    used.add(a.id);
    return {
      href: `/activity/${a.id}`,
      facts: [
        new Date(a.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: me.timezone }),
        a.duration_s && `${Math.round(a.duration_s / 60)} min`,
        shortDistance(a.distance_m, me.units, a.sport),
        a.avg_hr && `${Math.round(a.avg_hr)} bpm avg`,
      ].filter(Boolean) as string[],
    };
  };
  const calItems: CalItem[] = [];
  for (const [d, ws] of plannedBy) {
    for (const w of ws) {
      const act =
        allDone.find((x) => x.planned_workout_id === w.id) ??
        (w.status === "draft"
          ? undefined
          : (doneBy.get(d) ?? []).find((x) => !x.planned_workout_id && !used.has(x.id) && x.athlete_id === w.athlete_id && sportGroup(x.sport) === sportGroup(w.sport)));
      const acts = act ? [actual(act)] : [];
      // A brick is two recordings: the run off the bike joins it too.
      const runOff = act && w.brick?.steps?.length ? (doneBy.get(d) ?? []).find((x) => !used.has(x.id) && x.athlete_id === w.athlete_id && (x.planned_workout_id === w.id || (!x.planned_workout_id && sportGroup(x.sport) === "run"))) : undefined;
      if (runOff) acts.push(actual(runOff));
      const done = w.status === "completed" || acts.length > 0;
      const peek: Peek = { ...toPeek(w, { coach: isCoach, done, units, who: prefix(w.athlete_id) || undefined }), actual: acts };
      calItems.push({
        id: w.id, day: d, done, sport: sportGroup(w.sport),
        who: prefix(w.athlete_id),
        text: peek.title,
        sub: [peek.sport, peek.minutes && `${peek.minutes} min`, w.status === "draft" && "draft"].filter(Boolean).join(" · "),
        // Coaches move anything not yet done; athletes move their own sent sessions (their coach is notified).
        movable: !done && (isCoach || (w.athlete_id === me.id && ["approved", "sent"].includes(w.status))),
        peek,
      });
    }
  }
  for (const [d, as] of doneBy) {
    for (const a of as) {
      if (used.has(a.id)) continue;
      const label = a.sport ? sportLabel(a.sport) : "Activity";
      calItems.push({
        id: a.id, day: d, done: true, movable: false, sport: sportGroup(a.sport),
        who: prefix(a.athlete_id),
        text: label,
        sub: [a.duration_s && `${Math.round(a.duration_s / 60)} min`, shortDistance(a.distance_m, me.units, a.sport)].filter(Boolean).join(" · "),
        peek: {
          id: a.id, href: `/activity/${a.id}`, title: label, who: prefix(a.athlete_id) || undefined, badge: { label: "Done", done: true }, sport: label,
          time: null, minutes: a.duration_s ? Math.round(a.duration_s / 60) : null, hardMinutes: 0, description: null, lines: [], more: 0, sealed: false,
          actual: [actual(a)], unplanned: true,
        },
      });
    }
  }
  const dayItems = calItems.filter((i) => i.day === selected);
  const dayBase = href({ day: "DAY" }).replace("DAY", "");

  return (
    <AthleteShell isCoach={isCoach} wide={span !== "month"}>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-4">
        <div className="min-w-0">
          <p className="hidden text-xs uppercase tracking-[0.3em] text-emerald-200/60 sm:block">Calendar</p>
          <h1 className="text-2xl font-medium tracking-tight sm:mt-2 sm:text-4xl">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link href={href(step(-1))} aria-label={span === "month" ? "Previous month" : "Earlier"} scroll={false} className="flex h-11 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09] sm:w-11">
            <ChevronLeft size={18} />
          </Link>
          <Link href={href(span === "month" ? { month: today.slice(0, 7), day: today } : { start: sunday(today), day: today })} scroll={false} className="flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.05] px-3 text-sm sm:px-4 active:scale-95 hover:bg-white/[0.09]">
            Today
          </Link>
          <Link href={href(step(1))} aria-label={span === "month" ? "Next month" : "Later"} scroll={false} className="flex h-11 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] active:scale-90 hover:bg-white/[0.09] sm:w-11">
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>

      <SpanCookie span={sp.span && span === sp.span ? span : null} />
      <div className="mt-4 flex items-center gap-2 sm:mt-5 sm:gap-3">
        <nav aria-label="Calendar range" className="flex shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          {SPANS.map((x) => (
            <Link
              key={x.key}
              href={href(switchTo(x.key))}
              scroll={false}
              aria-current={span === x.key ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-xl px-2.5 text-sm transition sm:px-3.5 ${span === x.key ? "bg-emerald-300 font-semibold text-emerald-950" : "text-white/65 hover:text-white"}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        {isCoach && (
          <div className="min-w-0 flex-1 sm:flex-none">
            <CalendarAthletePicker athletes={roster} value={focus ?? ""} query={span === "month" ? `span=month&month=${monthKey(month)}` : `span=${span}&start=${from}`} />
          </div>
        )}
        {isCoach && (
          <Link href="/team-calendar" className="hidden min-h-11 items-center rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.08] px-4 text-sm text-emerald-100 hover:bg-emerald-300/[0.14] sm:inline-flex">
            Team week →
          </Link>
        )}
      </div>

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

        {!dayItems.length ? (
          <p className="mt-3 text-sm text-white/55">{selected > today ? "Nothing planned yet." : "Rest day. Nothing planned or recorded."}</p>
        ) : (
          <ul className="stagger mt-4 grid gap-2">
            {dayItems.map((i) => (
              <WorkoutPeek key={i.id} w={i.peek} />
            ))}
          </ul>
        )}
      </section>
    </AthleteShell>
  );
}
