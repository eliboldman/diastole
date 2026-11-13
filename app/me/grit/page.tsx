import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import AthleteShell from "@/components/AthleteShell";
import { GritMark } from "@/components/grit/Art";
import GritStore from "@/components/grit/GritStore";
import { gearOf, ITEM } from "@/lib/grit/catalog";
import { getGrit } from "@/lib/grit/data";
import { settleGrit } from "@/lib/grit/settle";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Grit bank · Diastole" };

const KIND_LABEL: Record<string, string> = {
  session: "Session",
  checkin: "Check-in",
  smart_rest: "Smart call",
  camp: "Camp",
  challenge: "Pod goal",
  quest: "Rest day quest",
  boss: "Boss defeated",
  purchase: "Store",
};

export default async function GritPage() {
  const me = await requireUser();
  const supabase = await createClient();
  await Promise.race([settleGrit(me.id, supabase).catch(() => 0), new Promise((r) => setTimeout(r, 1500))]);
  const [{ data: prof }, { data: avatar }] = await Promise.all([
    supabase.from("profiles").select("grit_seen_at").eq("id", me.id).maybeSingle(),
    supabase.from("avatars").select("look").eq("athlete_id", me.id).maybeSingle(),
  ]);
  const grit = await getGrit(supabase, me.id, prof?.grit_seen_at ?? null, 60);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: me.timezone });
  const earnedOn = (r: { created_at: string; detail: Record<string, unknown> | null }) =>
    typeof r.detail?.day === "string" ? new Date(`${r.detail.day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : day(r.created_at);
  const monthAgo = new Date(Date.parse(`${new Date().toLocaleDateString("en-CA", { timeZone: me.timezone })}T12:00:00Z`) - 30 * 86_400_000).toISOString();
  const earned30 = grit.history.filter((r) => r.amount > 0 && r.created_at >= monthAgo).reduce((s, r) => s + r.amount, 0);

  return (
    <AthleteShell isCoach={me.role === "coach"}>
      <Link href="/me" className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white">
        <ChevronLeft size={16} aria-hidden /> Today
      </Link>

      <section className="row-in mt-4 rounded-[28px] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.10] to-white/[0.03] p-6 backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Grit bank</p>
        <p className="mt-2 flex items-center gap-3 text-5xl font-semibold tabular-nums tracking-tight">
          <GritMark size={40} /> {grit.balance.toLocaleString()}
        </p>
        <a href="#store" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-semibold text-emerald-950 transition active:scale-95 hover:bg-emerald-200">
          Shop the store →
        </a>
        <p className="mt-3 text-sm text-white/60">{earned30 > 0 ? `+${earned30.toLocaleString()} in the last 30 days.` : "Your first sessions will start it off."}</p>
        <details className="group mt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-emerald-200 hover:underline">How you earn it</summary>
          <ul className="mt-1 grid gap-1.5 text-sm text-white/70">
            <li>Every session of 10+ minutes: more for longer and harder (your check-in effort counts).</li>
            <li>A planned session on a low-readiness or short-sleep day earns extra. Not when you&apos;re sick, injured or hurting.</li>
            <li>Easing off on a low-readiness day is a smart call: that earns grit too.</li>
            <li>Check-ins, camp goals and pod team goals.</li>
            <li className="text-white/50">Grit can&apos;t be bought and never changes your training.</li>
          </ul>
        </details>
      </section>

      <div id="store" className="scroll-mt-24">
        <GritStore balance={grit.balance} owned={grit.owned} gear={gearOf(avatar?.look)} look={avatar?.look ?? {}} />
      </div>

      <section className="mt-8">
        <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.2em] text-white/45">History</h2>
        {grit.history.length === 0 ? (
          <p className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/55">Nothing yet. Finish a session and it shows up here.</p>
        ) : (
          <ul className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.05]">
            {grit.history.map((r, i) => (
              <li key={r.id} className={`flex min-h-14 items-center gap-3 px-4 py-2.5 ${i ? "border-t border-white/[0.08]" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.kind === "purchase" ? `Bought ${ITEM[r.reason ?? ""]?.name ?? "an item"}` : (r.reason ?? KIND_LABEL[r.kind] ?? "Grit")}</span>
                  <span className="block text-xs text-white/50">
                    {KIND_LABEL[r.kind] ?? r.kind} · {earnedOn(r)}
                    {r.detail?.mult && Number(r.detail.mult) > 1 ? " · low-readiness bonus" : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${r.amount > 0 ? "text-emerald-200" : "text-white/55"}`}>
                  {r.amount > 0 ? `+${r.amount}` : r.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AthleteShell>
  );
}
