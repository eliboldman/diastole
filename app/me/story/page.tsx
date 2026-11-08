import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";
import StoryShare from "@/components/StoryShare";
import { asPeriod, isMonth, monthName, periodRange, PERIODS, prevMonth } from "@/lib/story";
import { loadStory } from "@/lib/story-data";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Season story · Diastole" };

const signed = (n: number, unit: string) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;

/** The season story: a shareable image of a stretch of training. Only ever your own. Calendar months add a recap against the month before. */
export default async function StoryPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const me = await requireUser();
  const period = asPeriod((await searchParams).period);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const lastMonth = prevMonth(today.slice(0, 7));
  const chips = [{ id: lastMonth, label: monthName(lastMonth) }, ...PERIODS.map((p) => ({ id: p.id as string, label: p.label }))];
  if (isMonth(period) && period !== lastMonth) chips.unshift({ id: period, label: `${monthName(period)} ${period.slice(0, 4)}` });

  // A calendar month: the totals next to the month before, and the shoes that did the most work.
  let recap: { lines: string[]; shoe: string | null } | null = null;
  if (isMonth(period)) {
    const supabase = await createClient();
    const cur = periodRange(period, today);
    const prev = periodRange(prevMonth(period), today);
    const [a, b] = await Promise.all([loadStory(supabase, me.id, cur.from, cur.to, me.timezone), loadStory(supabase, me.id, prev.from, prev.to, me.timezone)]);
    const mi = me.units === "mi";
    const dist = (m: number) => `${Math.round(mi ? m / 1609.344 : m / 1000)} ${mi ? "mi" : "km"}`;
    const lines = [`${a.hours} h over ${a.workouts} ${a.workouts === 1 ? "workout" : "workouts"}`];
    if (b.workouts) lines.push(`${signed(Math.round((a.hours - b.hours) * 10) / 10, " h")} and ${signed(a.workouts - b.workouts, "")} workouts vs ${monthName(prevMonth(period))}`);
    if (a.prs) lines.push(`${a.prs} new ${a.prs === 1 ? "personal record" : "personal records"} 🏅`);
    recap = { lines, shoe: a.topShoe ? `Most ${mi ? "miles" : "kilometers"} in: ${a.topShoe.model} (${dist(a.topShoe.m)})` : null };
  }

  return (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/60">Share</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">{isMonth(period) ? `Your ${monthName(period)}` : "Season story"}</h1>
      <p className="mt-2 text-white/55">Your training in one picture, sized for stories. Only totals are shown: no health data, routes or dates of single workouts.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {chips.map((p) => (
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
      {recap && (
        <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
          <ul className="space-y-1.5 text-sm text-white/80">
            {recap.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {recap.shoe && <li>👟 {recap.shoe}</li>}
          </ul>
        </section>
      )}
      <StoryShare key={period} src={`/api/story?period=${period}`} />
    </DashboardShell>
  );
}
