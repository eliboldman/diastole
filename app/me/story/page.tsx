import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import StoryShare from "@/components/StoryShare";
import { asPeriod, PERIODS } from "@/lib/story";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Season story · Diastole" };

/** The season story: a shareable image of a stretch of training. Only ever your own. */
export default async function StoryPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await requireUser();
  const period = asPeriod((await searchParams).period);
  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Share</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Season story</h1>
      <p className="mt-2 text-white/55">Your training in one picture, sized for stories. Only totals are shown: no health data, routes or dates of single workouts.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.id}
            href={`/me/story?period=${p.id}`}
            aria-current={p.id === period ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-2xl border px-4 text-sm ${p.id === period ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <StoryShare key={period} src={`/api/story?period=${period}`} />
    </DashboardShell>
  );
}
