import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import TeamBoard, { type BoardWorkout } from "@/components/teamcal/TeamBoard";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team calendar · Diastole" };

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monday = (d: string) => {
  const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
  return addDays(d, -((dow + 6) % 7));
};

export default async function TeamCalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: coach.timezone });
  const start = monday(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const supabase = await createClient();
  const [{ data: roster }, { data: pods }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("coach_id", coach.id).eq("is_test", false).order("full_name"),
    supabase.from("pods").select("id, name, pod_members(athlete_id, status)").eq("coach_id", coach.id).order("name"),
  ]);
  const athletes = (roster ?? []).map((a) => ({ id: a.id, name: a.full_name || a.email || "Athlete" }));
  const { data: planned } = athletes.length
    ? await supabase
        .from("planned_workouts")
        .select("id, athlete_id, scheduled_date, title, sport, status")
        .in("athlete_id", athletes.map((a) => a.id))
        .is("deleted_at", null)
        .gte("scheduled_date", days[0])
        .lte("scheduled_date", days[6])
        .order("scheduled_date")
    : { data: [] };
  const podList = (pods ?? []).map((p) => ({ id: p.id, name: p.name, members: ((p.pod_members as { athlete_id: string; status: string }[]) ?? []).filter((m) => m.status === "active").map((m) => m.athlete_id) }));

  return (
    <DashboardShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Week of {new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Team calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/team-calendar?week=${addDays(start, -7)}`} className="min-h-11 rounded-2xl border border-white/15 px-3 py-2.5 text-sm text-white/75 hover:bg-white/[0.06]">← Prev</Link>
          <Link href="/team-calendar" className="min-h-11 rounded-2xl border border-white/15 px-3 py-2.5 text-sm text-white/75 hover:bg-white/[0.06]">This week</Link>
          <Link href={`/team-calendar?week=${addDays(start, 7)}`} className="min-h-11 rounded-2xl border border-white/15 px-3 py-2.5 text-sm text-white/75 hover:bg-white/[0.06]">Next →</Link>
        </div>
      </div>
      <TeamBoard key={start} days={days} today={today} athletes={athletes} pods={podList} initial={(planned ?? []) as BoardWorkout[]} />
    </DashboardShell>
  );
}
