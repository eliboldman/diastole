import { CalendarRange, ChevronRight, Upload, Hammer, Leaf } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import EmptyState from "@/components/EmptyState";
import RideButtons from "@/components/RideButtons";

import DashboardShell from "@/components/layout/DashboardShell";
import WeekReview from "@/components/training/WeekReview";
import { getWeek, weekStartFrom } from "@/lib/training/week-data";
import { clock, shortDistance, sportLabel } from "@/lib/activity/format";
import { daysBackIso } from "@/lib/activity/zones";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Training · Diastole" };

const row = "lift flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2";

/** The athlete's Training tab: what's planned, what's done, and the full calendar. */
export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const weekParam = (await searchParams).week;
  const inTwoWeeks = new Date(daysBackIso(-14)).toLocaleDateString("en-CA", { timeZone: me.timezone });

  const [{ data: planned }, { data: done }, week] = await Promise.all([
    supabase
      .from("planned_workouts")
      .select("id, scheduled_date, title, sport, status")
      .eq("athlete_id", me.id)
      .is("deleted_at", null)
      .neq("status", "draft")
      .gte("scheduled_date", today)
      .lte("scheduled_date", inTwoWeeks)
      .order("scheduled_date")
      .limit(30),
    supabase
      .from("activities")
      .select("id, name, sport, start_time, duration_s, distance_m, avg_hr")
      .eq("athlete_id", me.id)
      .order("start_time", { ascending: false })
      .limit(20),
    getWeek(supabase, me.id, me.timezone, weekStartFrom(weekParam, today)),
  ]);

  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Your plan</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-bold tracking-tight">Training</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/training/mine" className="flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm font-medium text-emerald-50 hover:bg-emerald-300/20">
            <Hammer size={16} aria-hidden /> My workouts
          </Link>
          <Link href="/recovery" className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 hover:bg-white/[0.1]">
            <Leaf size={16} aria-hidden /> Recovery
          </Link>
          <Link href="/me/upload" className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 hover:bg-white/[0.1]">
            <Upload size={16} aria-hidden /> Upload workout
          </Link>
          <Link href="/calendar" className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 hover:bg-white/[0.1]">
            <CalendarRange size={16} aria-hidden /> Calendar
          </Link>
        </div>
      </div>

      <RideButtons hub quietOnWeb />

      <div className="mt-8">
        <WeekReview week={week} units={me.units === "km" ? "km" : "mi"} basePath="/training" workoutHref={(id) => `/training/workouts/${id}`} you />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Next two weeks</h2>
        {!planned?.length ? (
          <p className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/55">Nothing planned yet. Your coach&apos;s workouts show up here once they&apos;re sent.</p>
        ) : (
          <ul className="grid gap-2">
            {planned.map((w) => (
              <li key={w.id}>
                <Link href={`/training/workouts/${w.id}`} className={row}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{w.title}</span>
                    <span className="block text-xs text-white/50">
                      {day(w.scheduled_date)} · {sportLabel(w.sport)}
                      {w.status === "completed" ? " · done" : ""}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Recent workouts</h2>
        {!done?.length ? (
          <EmptyState emoji="⌚" title="No workouts yet" href="/connect" action="Check your watch connection">
            Workouts appear here a few minutes after your watch syncs.
          </EmptyState>
        ) : (
          <ul className="grid gap-2">
            {done.map((a) => (
              <li key={a.id}>
                <Link href={`/activity/${a.id}`} className={row}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name || sportLabel(a.sport)}</span>
                    <span className="block truncate text-xs text-white/50">
                      {[
                        new Date(a.start_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: me.timezone }),
                        clock(a.duration_s),
                        shortDistance(a.distance_m, me.units, a.sport),
                        a.avg_hr ? `${Math.round(a.avg_hr)} bpm` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-white/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
