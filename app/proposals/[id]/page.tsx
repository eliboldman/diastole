import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import AthleteShell from "@/components/AthleteShell";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Brick, Step } from "@/lib/workouts/garmin-format";
import { structure } from "@/lib/workouts/totals";

import Decide, { type Choice } from "../Decide";

export const metadata: Metadata = { title: "Suggestion · Diastole" };

const pastDue = (iso: string) => Date.parse(iso) < Date.now();

const CHOICES: Record<string, Choice[]> = {
  readiness_swap: [
    { value: "easy", label: "Make it easy", primary: true },
    { value: "rest", label: "Rest day" },
    { value: "keep", label: "Keep as planned" },
  ],
  reschedule: [
    { value: "move", label: "Move it", primary: true },
    { value: "drop", label: "Drop it" },
  ],
  goal_pace: [
    { value: "apply", label: "Reset goal pace", primary: true },
    { value: "decline", label: "Keep 3:55 pace" },
  ],
  deficit_up: [
    { value: "apply", label: "Add 100 kcal on easy days", primary: true },
    { value: "decline", label: "Keep it as is" },
  ],
};

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser();
  const supabase = await createClient(); // row-level security: only your own
  const { data: p } = await supabase.from("coach_proposals").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const units = me.units === "km" ? "km" : "mi";
  const payload = p.payload as {
    before?: { title: string; steps: Step[]; brick: Brick };
    after?: { title: string; steps: Step[]; brick: Brick };
    summary?: string;
    from?: string;
    to?: string;
  };
  const sport = p.kind === "readiness_swap" && p.workout_id ? (await supabase.from("planned_workouts").select("sport").eq("id", p.workout_id).maybeSingle()).data?.sport ?? "run" : "run";
  const expired = p.status === "pending" && p.expires_at && pastDue(p.expires_at);
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href="/proposals" className="text-sm text-white/50 hover:text-white/80">
        ← Suggestions
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{p.title}</h1>
      {p.body && <p className="mt-3 max-w-2xl text-white/70">{p.body}</p>}

      {payload.before && payload.after && (
        <div className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 p-4">
            <p className="text-xs uppercase tracking-wide text-white/45">As planned</p>
            <p className="mt-1 font-medium">{payload.before.title}</p>
            <p className="mt-1 text-sm text-white/60">{structure(payload.before.steps ?? [], sport, null, units)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.04] p-4">
            <p className="text-xs uppercase tracking-wide text-emerald-100/70">Easy version</p>
            <p className="mt-1 font-medium">{payload.after.title}</p>
            <p className="mt-1 text-sm text-white/60">{payload.summary ?? structure(payload.after.steps ?? [], sport, null, units)}</p>
          </div>
        </div>
      )}
      {p.kind === "reschedule" && payload.from && payload.to && (
        <p className="mt-6 text-white/70">
          From {day(payload.from)} to <span className="text-emerald-100">{day(payload.to)}</span>, same time.
        </p>
      )}

      {p.status === "pending" && !expired ? (
        <Decide id={p.id} choices={CHOICES[p.kind] ?? []} />
      ) : (
        <p className="mt-6 text-sm text-white/55">
          {expired ? "This suggestion has expired." : p.status === "approved" ? `Applied. ${p.result ?? ""}` : `Kept as planned. ${p.result ?? ""}`}
        </p>
      )}
      <p className="mt-8 max-w-2xl text-xs text-white/40">Suggestions come from the plan&apos;s own rules (no AI). Nothing changes until you choose; applying one also updates your watch.</p>
    </AthleteShell>
  );
}
