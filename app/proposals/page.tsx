import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import { CHECKPOINTS, laneText, type Lane } from "@/lib/autocoach/plan";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Suggestions · Diastole" };

const pastDue = (iso: string) => Date.parse(iso) < Date.now();
const STATUS: Record<string, string> = { pending: "Waiting for you", approved: "Applied", declined: "Kept as planned", expired: "Expired" };

/** Self-coaching suggestions: readiness swaps, moved sessions, goal-pace resets, and checkpoint lanes. */
export default async function ProposalsPage() {
  const me = await requireUser();
  const supabase = await createClient();
  const [{ data: rows }, { data: cps }] = await Promise.all([
    supabase.from("coach_proposals").select("id, title, status, created_at, result, expires_at").eq("athlete_id", me.id).order("created_at", { ascending: false }).limit(40),
    supabase.from("plan_checkpoints").select("checkpoint, lane, results, evaluated_at").eq("athlete_id", me.id).order("checkpoint"),
  ]);
  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Self-coaching</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Suggestions</h1>
      <p className="mt-3 max-w-2xl text-white/60">From your plan&apos;s rules: a 20-minute check on a red-readiness day, lighter days when red days run together, a call on next week from the Sunday review, a new day for a missed key session, and goal-pace resets after checkpoints. Nothing changes until you choose.</p>
      {cps?.length ? (
        <section className="mt-6 max-w-2xl rounded-2xl border border-white/10 p-4">
          <h2 className="font-medium">Checkpoints</h2>
          <ul className="mt-2 space-y-1 text-sm text-white/70">
            {cps.map((c) => (
              <li key={c.checkpoint}>
                Checkpoint {c.checkpoint}: <span className="text-white">{laneText(CHECKPOINTS.find((x) => x.n === c.checkpoint) ?? {}, c.lane as Lane)}</span>
                <span className="text-white/45"> · {Object.values(c.results as Record<string, { label: string; lane: string }>).map((r) => `${r.label} ${r.lane}`).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ul className="mt-6 max-w-2xl divide-y divide-white/[0.08]">
        {(rows ?? []).map((r) => {
          const status = r.status === "pending" && r.expires_at && pastDue(r.expires_at) ? "expired" : r.status;
          return (
            <li key={r.id} className="py-3">
              <Link href={`/proposals/${r.id}`} className="block hover:opacity-80">
                <p className="font-medium">{r.title}</p>
                <p className={`text-sm ${status === "pending" ? "text-emerald-200" : "text-white/50"}`}>
                  {STATUS[status] ?? status} · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: me.timezone })}
                </p>
              </Link>
            </li>
          );
        })}
        {!rows?.length && <li className="py-3 text-sm text-white/50">Nothing yet.</li>}
      </ul>
    </AthleteShell>
  );
}
