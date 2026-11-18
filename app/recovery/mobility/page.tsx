import { ChevronRight, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import BackLink from "@/components/layout/BackLink";
import DashboardShell from "@/components/layout/DashboardShell";
import { PriorityList, ResultList } from "@/components/mobility/Results";
import { DAY_WORDS, screensFor, todaysFlow } from "@/lib/mobility/data";
import { RETEST_DAYS } from "@/lib/mobility/screen";
import { minutesLabel, routineSeconds } from "@/lib/recovery/catalog";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mobility · Diastole" };

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The athlete's mobility: latest screen, what to work on, today's flow, and past scores. */
export default async function MobilityPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const [flow, history] = await Promise.all([todaysFlow(supabase, me.id, today, me.timezone), screensFor(supabase, me.id)]);
  const shell = (body: React.ReactNode) => (
    <DashboardShell role={me.role === "coach" ? "coach" : "athlete"}>
      <BackLink href="/recovery" label="Recovery" />
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Mobility</h1>
      {body}
    </DashboardShell>
  );

  if (!flow) {
    return shell(
      <section className="mt-6 rounded-[28px] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.08] to-white/[0.02] p-6">
        <h2 className="text-xl font-semibold">Find out where you&apos;re tight</h2>
        <p className="mt-2 text-white/65">
          Eight quick tests picked for swimming, cycling and running, scored left and right. Then you get a short flow every day, fitted around your training.
        </p>
        <Link href="/recovery/screen" className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-6 font-semibold text-emerald-950 active:scale-95">
          Take the screen <ChevronRight size={16} aria-hidden />
        </Link>
      </section>,
    );
  }

  const { screen, pri, day, items } = flow;
  const retest = new Date(Date.parse(`${screen.taken_on}T12:00:00Z`) + RETEST_DAYS * 86_400_000).toISOString().slice(0, 10);
  const prev = history[1];
  return shell(
    <>
      {sp.new && <p className="row-in mt-3 rounded-2xl bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">Saved. Here&apos;s what to work on.</p>}

      <section className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Mobility score</p>
          <p className="mt-1 text-5xl font-bold tabular-nums">
            {screen.score}
            <span className="text-xl text-white/40">/100</span>
          </p>
          <p className="mt-1 text-sm text-white/55">
            {`Tested ${fmt(screen.taken_on)}`}
            {prev && ` · ${screen.score - prev.score >= 0 ? "+" : ""}${screen.score - prev.score} since ${fmt(prev.taken_on)}`}
          </p>
        </div>
        <Link href="/recovery/screen" className="inline-flex min-h-11 items-center rounded-2xl border border-white/10 px-4 text-sm text-white/75 hover:bg-white/[0.06]">
          {retest <= today ? "Time to retest" : `Retest around ${fmt(retest)}`}
        </Link>
      </section>

      <section className="mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-300/[0.05] p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">{`Today · ${DAY_WORDS[day].title}`}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/65">{`${DAY_WORDS[day].sub} ${items.length} moves, ${minutesLabel(routineSeconds(items))}.`}</p>
          <Link href="/recovery/mobility-today?from=/recovery/mobility" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-5 font-semibold text-emerald-950 active:scale-95">
            <Play size={16} aria-hidden /> Start
          </Link>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Work on</h2>
        <PriorityList pri={pri} />
      </section>

      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-2">
        <ResultList results={screen.results} />
      </section>

      {history.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm uppercase tracking-[0.15em] text-white/50">Past screens</h2>
          <ul className="flex flex-wrap gap-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                <span className="font-semibold tabular-nums">{h.score}</span> <span className="text-white/50">{fmt(h.taken_on)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-8 text-center text-xs text-white/40">General mobility guidance, not medical treatment. If something hurts, tell your coach or see a physical therapist.</p>
    </>,
  );
}
