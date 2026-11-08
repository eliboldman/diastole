import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import DashboardShell from "@/components/layout/DashboardShell";
import { minutesLabel, routineSeconds, suggestRoutine } from "@/lib/recovery/catalog";
import { routinesFor } from "@/lib/recovery/data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recovery · Diastole" };

/** Recovery: what the coach assigned, a suggestion for today, and every routine. Reached from Today and Training. */
export default async function RecoveryPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86_400_000).toISOString();
  const coachId = me.role === "coach" ? me.id : me.coach_id;
  const [{ data: assigned }, routines, { data: checks }, { data: ready }] = await Promise.all([
    supabase.from("recovery_assignments").select("id, title, items, scheduled_date").eq("athlete_id", me.id).is("completed_at", null).gte("scheduled_date", weekAgo.slice(0, 10)).order("scheduled_date").limit(10),
    routinesFor(supabase, coachId),
    supabase.from("workout_checkins").select("pain").eq("athlete_id", me.id).gte("created_at", new Date(Date.parse(`${today}T12:00:00Z`) - 3 * 86_400_000).toISOString()),
    supabase.from("readiness_scores").select("overall").eq("athlete_id", me.id).eq("date", today).maybeSingle(),
  ]);
  const spots = (checks ?? []).flatMap((c) => Object.keys((c.pain ?? {}) as Record<string, number>));
  const tip = suggestRoutine({ spots, readiness: (ready?.overall as string) ?? null });
  const when = (d: string) => (d === today ? "Today" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }));

  const row = (href: string, title: string, sub: string) => (
    <li key={href}>
      <Link href={href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 transition active:scale-[0.99] hover:bg-white/[0.06]">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-white/50">{sub}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
      </Link>
    </li>
  );

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Training</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Recovery</h1>
      <p className="mt-2 text-white/55">Rolling, stretching and breathing, with your coach&apos;s demos. General recovery guidance, not medical treatment.</p>

      {(assigned ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">From your coach</h2>
          <ul className="space-y-2">{(assigned ?? []).map((a) => row(`/recovery/a-${a.id}?from=/recovery`, a.title, `${when(a.scheduled_date)} · ${minutesLabel(routineSeconds(a.items as never))}`))}</ul>
        </section>
      )}

      {tip && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Suggested for today</h2>
          <ul>{row(`/recovery/${tip.routine.id}?from=/recovery&s=suggested`, tip.routine.title, `${tip.why} ${minutesLabel(routineSeconds(tip.routine.items))}`)}</ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">All routines</h2>
        <ul className="space-y-2">{routines.map((r) => row(`/recovery/${r.id}?from=/recovery`, r.title, `${minutesLabel(routineSeconds(r.items))}${r.description ? ` · ${r.description}` : ""}`))}</ul>
      </section>
    </DashboardShell>
  );
}
