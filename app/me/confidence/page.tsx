import { ChevronLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import BankList from "@/components/confidence/BankList";
import { readySummary } from "@/lib/confidence/collect";
import { getBank, refreshBank } from "@/lib/confidence/data";
import { createAdminClient, createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Confidence bank · Diastole" };

/** The confidence bank. With ?for=<workout or race>, it opens with a "you're ready" summary. */
export default async function ConfidencePage({ searchParams }: { searchParams: Promise<{ for?: string; race?: string }> }) {
  const me = await requireUser();
  const q = await searchParams;
  await Promise.race([refreshBank(createAdminClient(), me.id).catch(() => 0), new Promise((r) => setTimeout(r, 2500))]);
  const supabase = await createClient();
  const entries = await getBank(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: me.timezone });
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const [{ data: w }, { data: race }] = await Promise.all([
    uuid(q.for) ? supabase.from("planned_workouts").select("title, sport, mystery, revealed_at").eq("id", q.for!).eq("athlete_id", me.id).maybeSingle() : Promise.resolve({ data: null }),
    uuid(q.race) ? supabase.from("races").select("name").eq("id", q.race!).eq("athlete_id", me.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const summary = race ? readySummary(entries, { race: race.name }) : w ? readySummary(entries, { minutes: null, sport: w.sport, title: w.title }) : null;
  const what = race ? race.name : w ? (w.mystery && !w.revealed_at ? "today's mystery session" : w.title) : null;

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href="/account" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">
        <ChevronLeft size={16} aria-hidden /> Profile
      </Link>
      <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Confidence bank</h1>
      <p className="mt-2 text-white/55">Proof you&apos;re ready, saved from your own training as you go. Only you and your coach see it.</p>

      {summary && (
        <section className="row-in mt-6 rounded-[28px] border border-emerald-300/25 bg-gradient-to-br from-emerald-300/[0.10] to-white/[0.02] p-5">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-emerald-200/80">
            <ShieldCheck size={14} aria-hidden /> You&apos;re ready{what ? ` for ${what}` : ""}
          </p>
          <ul className="mt-3 grid gap-2">
            {summary.map((l, i) => (
              <li key={i} className="row-in text-[15px] leading-relaxed text-white/90" style={{ animationDelay: `${i * 120}ms` }}>
                {l}
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length === 0 && <p className="mt-8 text-white/55">It fills itself as you train: long sessions, bricks, PRs, hard days you finished anyway, and kind words from your coach. You can add your own too.</p>}
      <BankList entries={entries} today={today} />
    </AthleteShell>
  );
}
