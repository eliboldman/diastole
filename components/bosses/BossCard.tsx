import type { CSSProperties } from "react";

import BossArt, { moodFor } from "@/components/bosses/BossArt";
import { BOSS, healthLeft, type Limiter } from "@/lib/bosses/bosses";
import { createAdminClient } from "@/lib/supabase/server";

type Boss = { id: string; limiter: Limiter; status: string; hp: number; month: string; evidence: string | null };

/**
 * The athlete's boss, next to their avatar. Only the athlete and their coach ever see it (the page
 * only renders this for them). Shows nothing until the coach approves one.
 */
export default async function BossCard({ athleteId, viewer }: { athleteId: string; viewer: "athlete" | "coach" }) {
  const admin = createAdminClient();
  const { data: rows } = await admin.from("bosses").select("id, limiter, status, hp, month, evidence").eq("athlete_id", athleteId).in("status", ["active", "defeated", "escaped"]).order("month", { ascending: false }).limit(12);
  const bosses = (rows ?? []) as Boss[];
  // This month's, or last month's (so an escape or late win is still shown for a while).
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const current = bosses[0] && bosses[0].month >= lastMonth ? bosses[0] : null;
  const beaten = bosses.filter((b) => b.status === "defeated");
  if (!current && !beaten.length) return null;
  const { data: hits } = current ? await admin.from("boss_hits").select("kind, amount, label, created_at").eq("boss_id", current.id).order("created_at", { ascending: false }) : { data: [] };
  const left = current ? healthLeft(current.hp, hits ?? []) : 0;
  const pct = current ? Math.round((left / current.hp) * 100) : 0;

  return (
    <section className="row-in mt-6 w-full rounded-[28px] border border-white/10 bg-white/[0.05] p-5 text-left backdrop-blur-xl" aria-label="Boss">
      {current && (
        <>
          <p className="text-[11px] uppercase tracking-[0.15em] text-amber-200/75">{current.status === "defeated" ? "Boss defeated" : current.status === "escaped" ? "Last month's boss" : "This month's boss"}</p>
          <div className="mt-2 flex items-center gap-4">
            <BossArt limiter={current.limiter} mood={moodFor(left, current.hp, current.status === "defeated")} size={104} />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-semibold">{BOSS[current.limiter].name}</p>
              <p className="text-sm text-white/60">{BOSS[current.limiter].limiter}</p>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10" role="meter" aria-valuemin={0} aria-valuemax={current.hp} aria-valuenow={left} aria-label={`${BOSS[current.limiter].name} health`}>
                <div
                  className={`hp-drain h-full rounded-full ${pct > 60 ? "bg-rose-400" : pct > 25 ? "bg-amber-300" : "bg-emerald-300"}`}
                  style={{ "--from": "100%", "--to": `${pct}%`, width: `${pct}%` } as CSSProperties}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-white/55">{current.status === "defeated" ? "Beaten! Badge, 100 grit and boss-only gear unlocked." : current.status === "escaped" ? `It wandered off with ${left} of ${current.hp} health. A new one shows up this month.` : `${left} of ${current.hp} health left`}</p>
            </div>
          </div>
          {current.status === "active" && (
            <>
              <p className="mt-3 text-sm text-white/70">{BOSS[current.limiter].intro}</p>
              <p className="mt-1 text-sm text-white/55">{BOSS[current.limiter].how}</p>
              {viewer === "coach" && current.evidence && <p className="mt-1 text-xs text-white/45">Why: {current.evidence}</p>}
            </>
          )}
          {(hits ?? []).length > 0 && (
            <ul className="mt-3 grid gap-1 text-sm">
              {(hits ?? []).slice(0, 4).map((h, i) => (
                <li key={i} className="flex justify-between gap-3 text-white/65">
                  <span className="min-w-0 truncate">{h.kind === "bonus" ? "⚡ Bonus: measurable improvement" : h.label}</span>
                  <span className="shrink-0 tabular-nums text-amber-100">−{h.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {beaten.length > 0 && (
        <div className={current ? "mt-4 border-t border-white/[0.08] pt-3" : ""}>
          <p className="text-[11px] uppercase tracking-[0.15em] text-white/45">Bosses beaten</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {beaten.map((b) => (
              <li key={b.id} title={`${BOSS[b.limiter].name}, ${new Date(`${b.month}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`} className="flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-amber-200/[0.06] py-0.5 pl-0.5 pr-3 text-xs text-amber-100">
                <BossArt limiter={b.limiter} mood="beaten" size={26} />
                {BOSS[b.limiter].name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
