import { createClient } from "@/lib/supabase/server";

import PlanChangeActions from "@/components/coach/PlanChangeActions";

// Time math outside render.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Athletes' "Life happened" changes: ones waiting for the coach, plus the last few made automatically. */
export default async function PlanChanges({ coachId }: { coachId: string }) {
  const supabase = await createClient();
  const since = daysAgo(3);
  const { data } = await supabase
    .from("plan_changes")
    .select("id, athlete_id, summary, why, status, reason, created_at, planned_workouts(title), profiles!plan_changes_athlete_id_fkey(full_name)")
    .eq("coach_id", coachId)
    .or(`status.eq.pending,and(status.eq.auto,created_at.gte.${since})`)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data?.length) return null;
  const pending = data.filter((c) => c.status === "pending");
  const auto = data.filter((c) => c.status === "auto").slice(0, 5);
  const who = (c: (typeof data)[number]) => ((c.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "Athlete").split(" ")[0];
  const title = (c: (typeof data)[number]) => (c.planned_workouts as unknown as { title: string } | null)?.title;
  return (
    <section id="changes" className="mt-6 scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-5">
      <h2 className="text-lg font-medium">Plan changes</h2>
      {pending.length > 0 && (
        <ul className="mt-3 space-y-3">
          {pending.map((c) => (
            <li key={c.id} className="rounded-2xl bg-white/[0.04] p-3">
              <p className="text-xs text-white/50">
                {who(c)}
                {title(c) ? ` · ${title(c)}` : ""}
              </p>
              <p className="font-medium">{c.summary}</p>
              {c.why && <p className="text-xs text-white/55">{c.why}</p>}
              <PlanChangeActions id={c.id} />
            </li>
          ))}
        </ul>
      )}
      {auto.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-10 cursor-pointer list-none py-2 text-sm text-white/55">
            {auto.length} small change{auto.length === 1 ? "" : "s"} made automatically
          </summary>
          <ul className="space-y-1 text-sm text-white/65">
            {auto.map((c) => (
              <li key={c.id}>
                {who(c)}: {c.summary.toLowerCase()}
                {title(c) ? ` (${title(c)})` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
