import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import DashboardShell from "@/components/layout/DashboardShell";
import MyWorkouts from "@/components/training/MyWorkouts";
import Spotlight from "@/components/Spotlight";
import { seen, TIPS } from "@/lib/discovery";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, Step } from "@/lib/workouts/garmin-format";
import { WORKOUT_JSON_PROMPT } from "@/lib/workouts/json-import";

export const metadata: Metadata = { title: "My workouts · Diastole" };

/** The athlete's own workouts: build, import, and ask the coach to add them to the calendar. */
export default async function MyWorkoutsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [{ data: lib }, { data: reqs }, { data: prof }] = await Promise.all([
    supabase.from("athlete_library").select("id, title, sport, description, steps, pool_length, pool_unit, updated_at").eq("athlete_id", me.id).order("updated_at", { ascending: false }).limit(300),
    // Requests are drafts on the coach's side, which athletes can't read directly.
    createAdminClient()
      .from("planned_workouts")
      .select("id, title, sport, scheduled_date, declined_at, deleted_at")
      .eq("requested_by", me.id)
      .eq("athlete_id", me.id)
      .eq("status", "draft")
      .gte("scheduled_date", new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10))
      .order("scheduled_date")
      .limit(60),
    supabase.from("profiles").select("seen_tips").eq("id", me.id).maybeSingle(),
  ]);
  const unit = me.units === "km" ? "km" : "mi";
  const hasCoach = Boolean(me.coach_id && me.coach_id !== me.id);
  const items = (lib ?? []).map((w) => {
    const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "METER" | "YARD" } : null;
    return { id: w.id, title: w.title, sport: w.sport, description: w.description, steps: w.steps as Step[], pool, lines: describe(w.steps as Step[], unit, pool, w.sport === "swim") };
  });
  const requests = (reqs ?? [])
    .filter((r) => r.declined_at || !r.deleted_at)
    .map((r) => ({ id: r.id, title: r.title, sport: r.sport, date: r.scheduled_date, declined: Boolean(r.declined_at) }));

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Training</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-bold tracking-tight">My workouts</h1>
        <Link href="/training/mine/new" className="flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-300 px-4 text-sm font-medium text-black active:scale-95">
          <Plus size={16} aria-hidden /> Build one
        </Link>
      </div>
      <p className="mt-2 text-white/55">
        {hasCoach ? "Build your own sessions or import them. Ask your coach to add one, and it lands on your calendar and watch once they approve." : "Build your own sessions or import them, and keep them here."}
      </p>
      <Spotlight tip={TIPS.myWorkouts} seen={seen(prof?.seen_tips, TIPS.myWorkouts.id)} />
      <MyWorkouts items={items} requests={requests} today={today} hasCoach={hasCoach} prompt={WORKOUT_JSON_PROMPT} />
    </DashboardShell>
  );
}
