"use client";

import { CalendarRange, ChevronRight, Dumbbell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { addStrengthStarters } from "@/lib/plans/actions";

export type PlanCard = { id: string; name: string; weeks: number; tags: string[]; sessions: number; athletes: number; behind: number; updated_at: string };

/** The Plans shelf at the top of the Library: templates with tag filters. */
export default function PlanCards({ plans }: { plans: PlanCard[] }) {
  const router = useRouter();
  const [tag, setTag] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasStarters = plans.some((p) => p.tags.includes("strength") && /off-season strength|maintenance|resilience/i.test(p.name));
  const tags = useMemo(() => [...new Set(plans.flatMap((p) => p.tags))].sort(), [plans]);
  const shown = tag ? plans.filter((p) => p.tags.includes(tag)) : plans;
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6" aria-labelledby="plans-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="plans-h" className="flex items-center gap-2 text-lg font-medium">
          <CalendarRange size={18} className="text-emerald-200" aria-hidden /> Plans
        </h2>
        <p className="text-xs text-white/45">Save a block from any athlete&apos;s page (Planned workouts → Save as plan).</p>
      </div>
      {!hasStarters && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await addStrengthStarters(); router.refresh(); })}
          className="mt-3 flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-white/75 hover:bg-white/[0.05] disabled:opacity-50"
        >
          <Dumbbell size={14} className="text-emerald-200" aria-hidden /> {pending ? "Adding…" : "Add starter strength plans (off-season, in-season, resilience)"}
        </button>
      )}
      {plans.length === 0 ? (
        <p className="mt-3 text-sm text-white/55">No plans yet. Open an athlete, pick the weeks you like in Planned workouts, and save them as a plan to reuse.</p>
      ) : (
        <>
          {tags.length > 0 && (
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              <button type="button" onClick={() => setTag(null)} className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${tag === null ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}>
                All
              </button>
              {tags.map((t) => (
                <button key={t} type="button" onClick={() => setTag(t === tag ? null : t)} className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${tag === t ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {shown.map((p) => (
              <li key={p.id}>
                <Link href={`/library/plans/${p.id}`} className="lift flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.07]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block text-xs text-white/55">
                      {p.weeks} week{p.weeks === 1 ? "" : "s"} · {p.sessions} sessions{p.athletes ? ` · on ${p.athletes} athlete${p.athletes === 1 ? "" : "s"}` : ""}
                    </span>
                    {p.behind > 0 && <span className="mt-1 block text-xs text-amber-100/80">Updated since {p.behind === 1 ? "one athlete" : `${p.behind} athletes`} started it</span>}
                    {p.tags.length > 0 && (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/60">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-white/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
