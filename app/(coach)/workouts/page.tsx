import type { Metadata } from "next";

import BulkWorkouts from "@/components/coach/BulkWorkouts";
import DashboardShell from "@/components/layout/DashboardShell";
import { createClient, requireCoach } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Workouts · Diastole" };

type Search = { athlete?: string; from?: string; to?: string; q?: string; test?: string };

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const coach = await requireCoach();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: athletes } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("coach_id", coach.id)
    .order("full_name");

  let query = supabase
    .from("planned_workouts")
    .select("id, athlete_id, scheduled_date, title, sport, status")
    .eq("coach_id", coach.id)
    .is("deleted_at", null)
    .order("scheduled_date", { ascending: false })
    .limit(300);
  if (sp.athlete) query = query.eq("athlete_id", sp.athlete);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) query = query.gte("scheduled_date", sp.from);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) query = query.lte("scheduled_date", sp.to);
  const text = sp.test === "1" ? "test" : (sp.q ?? "").trim();
  if (text) query = query.or(`title.ilike.%${text.replace(/[%,()]/g, "")}%,description.ilike.%${text.replace(/[%,()]/g, "")}%`);
  const { data: workouts } = await query;

  const names = Object.fromEntries((athletes ?? []).map((a) => [a.id, a.full_name || a.email || "Athlete"]));

  return (
    <DashboardShell>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Workouts</h1>
      <p className="mt-2 text-sm text-white/40">Every planned workout across your athletes. Filter, select, and clean up in bulk.</p>

      <form className="mt-6 grid gap-2 rounded-[28px] border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto]">
        <select name="athlete" defaultValue={sp.athlete ?? ""} className="min-h-12 rounded-2xl border border-white/10 bg-neutral-900 px-3 text-base sm:text-sm">
          <option value="">All athletes</option>
          {(athletes ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {names[a.id]}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={sp.from} aria-label="From" className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-base sm:text-sm" />
        <input type="date" name="to" defaultValue={sp.to} aria-label="To" className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-base sm:text-sm" />
        <input
          name="q"
          defaultValue={sp.q}
          placeholder="Search title"
          className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-base placeholder:text-white/30 sm:text-sm"
        />
        <div className="flex gap-2">
          <button className="min-h-12 flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-sm font-medium active:scale-95">Filter</button>
          <a
            href="/workouts?test=1"
            className={`flex min-h-12 items-center rounded-2xl border px-4 text-sm active:scale-95 ${sp.test === "1" ? "border-amber-300/30 bg-amber-300/15 text-amber-100" : "border-white/10 text-white/60"}`}
          >
            “test”
          </a>
        </div>
      </form>

      <BulkWorkouts workouts={(workouts ?? []).map((w) => ({ ...w, athleteName: names[w.athlete_id] ?? "Athlete" }))} />
    </DashboardShell>
  );
}
