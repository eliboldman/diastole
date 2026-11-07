import Link from "next/link";

import PlanBatchActions from "@/components/coach/PlanBatchActions";
import { sportLabel } from "@/lib/activity/format";
import { createClient } from "@/lib/supabase/server";

type Summary = { summary?: string; weeks?: { week_start: string; focus: string; planned_hours: number | null }[]; other_days?: { date: string; kind: string; note: string }[]; assumptions?: string | null; dropped?: string[]; cost_usd?: number };
// Time math outside render.
const olderThanAWeek = (at: string) => Date.parse(at) < Date.now() - 7 * 86_400_000;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The latest suggested block for this athlete: the plan's reasoning, its drafts, approve or discard. */
export default async function PlanBatch({ athleteId }: { athleteId: string }) {
  const supabase = await createClient();
  const { data: batch } = await supabase.from("plan_batches").select("id, start_date, days, guidance, summary, created_at").eq("athlete_id", athleteId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!batch) return null;
  const { data: rows } = await supabase.from("planned_workouts").select("id, scheduled_date, title, sport, status, deleted_at").eq("plan_batch", batch.id).order("scheduled_date");
  const workouts = (rows ?? []).filter((w) => !w.deleted_at);
  const drafts = workouts.filter((w) => w.status === "draft").length;
  if (!workouts.length && olderThanAWeek(batch.created_at)) return null;
  const s = (batch.summary ?? {}) as Summary;
  const others = new Map((s.other_days ?? []).map((o) => [o.date, o]));
  const dates = [...new Set([...workouts.map((w) => w.scheduled_date), ...others.keys()])].sort();

  return (
    <section id="suggestions" className="scroll-mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.04] p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Suggested block</h2>
        <span className="text-xs text-white/45">
          {day(batch.start_date)} · {batch.days} day{batch.days === 1 ? "" : "s"}
          {s.cost_usd != null ? ` · $${s.cost_usd.toFixed(2)}` : ""}
        </span>
      </div>
      {batch.guidance && <p className="mt-1 text-sm italic text-white/50">“{batch.guidance}”</p>}
      {s.summary && <p className="mt-3 text-sm leading-relaxed text-white/80">{s.summary}</p>}
      {(s.weeks?.length ?? 0) > 1 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {s.weeks!.map((w) => (
            <li key={w.week_start} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm">
              <span className="text-white/50">Week of {day(w.week_start)}</span>
              {w.planned_hours ? <span className="text-white/50"> · ~{w.planned_hours} h</span> : null}
              <span className="block text-white/85">{w.focus}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 divide-y divide-white/[0.06]">
        {dates.map((d) => (
          <li key={d} className="py-2">
            <p className="text-xs uppercase tracking-wider text-white/45">{day(d)}</p>
            {workouts
              .filter((w) => w.scheduled_date === d)
              .map((w) => (
                <Link key={w.id} href={`/athlete/${athleteId}/workouts/${w.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg hover:bg-white/[0.04]">
                  <span className="min-w-0 truncate">{w.title}</span>
                  <span className="shrink-0 text-xs text-white/50">
                    {sportLabel(w.sport)} · {w.status === "draft" ? "draft" : w.status}
                  </span>
                </Link>
              ))}
            {others.get(d) && (
              <p className="text-sm text-white/55">
                <span className="capitalize">{others.get(d)!.kind}</span>: {others.get(d)!.note.replace(new RegExp(`^${others.get(d)!.kind}\\s*[:-]\\s*`, "i"), "")}
              </p>
            )}
          </li>
        ))}
      </ul>
      {s.assumptions && <p className="mt-3 text-sm text-amber-100/80">Assumed: {s.assumptions}</p>}
      {(s.dropped?.length ?? 0) > 0 && <p className="mt-2 text-xs text-white/45">Skipped (didn&apos;t pass the watch checks): {s.dropped!.join(", ")}</p>}
      {drafts > 0 && (
        <div className="mt-4">
          <PlanBatchActions batchId={batch.id} drafts={drafts} />
        </div>
      )}
    </section>
  );
}
