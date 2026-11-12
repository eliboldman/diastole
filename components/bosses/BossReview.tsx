import BossArt from "@/components/bosses/BossArt";
import BossButtons, { FindBosses } from "@/components/bosses/BossButtons";
import { BOSS, monthOf, type Limiter } from "@/lib/bosses/bosses";
import { createClient } from "@/lib/supabase/server";

/** Coach Today: this month's suggested bosses to approve, swap or skip. Quiet when there's nothing to decide. */
export default async function BossReview({ coachId, today, names }: { coachId: string; today: string; names: Record<string, string> }) {
  const supabase = await createClient();
  const month = monthOf(today);
  const { data: rows } = await supabase.from("bosses").select("id, athlete_id, limiter, status, evidence").eq("coach_id", coachId).eq("month", month);
  const all = rows ?? [];
  const pending = all.filter((b) => b.status === "suggested");
  const without = Object.keys(names).filter((id) => !all.some((b) => b.athlete_id === id));
  // Show the card when there's something to decide, or when nobody has a boss yet this month.
  if (!pending.length && !(without.length && !all.length)) return null;

  return (
    <section id="bosses" className="row-in mt-6 scroll-mt-6 rounded-[28px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.06] to-white/[0.02] p-5 sm:p-6">
      <h2 className="text-lg font-medium">This month&apos;s bosses</h2>
      <p className="mt-1 text-sm text-white/55">Each athlete&apos;s clearest limiter from their last 8 weeks, as a friendly boss on their profile. Nothing shows until you approve. Tag sessions against it on the athlete&apos;s page.</p>
      {pending.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {pending.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <BossArt limiter={b.limiter as Limiter} mood="fresh" size={56} />
              <div className="min-w-0 flex-1 basis-52">
                <p className="text-sm font-medium">
                  {names[b.athlete_id] ?? "Athlete"}: {BOSS[b.limiter as Limiter].limiter}
                </p>
                <p className="text-xs text-white/55">{b.evidence}</p>
              </div>
              <BossButtons id={b.id} limiter={b.limiter as Limiter} />
            </li>
          ))}
        </ul>
      )}
      {without.length > 0 && !all.length && <FindBosses count={without.length} />}
    </section>
  );
}
