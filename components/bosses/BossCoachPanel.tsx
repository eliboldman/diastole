import BossCard from "@/components/bosses/BossCard";
import { ChooseBoss, TargetToggle } from "@/components/bosses/BossButtons";
import { BOSS, monthOf, type Limiter } from "@/lib/bosses/bosses";
import { createClient } from "@/lib/supabase/server";

/** Coach, athlete page: this month's boss and which upcoming sessions are aimed at it. */
export default async function BossCoachPanel({ athleteId, today, firstName }: { athleteId: string; today: string; firstName: string }) {
  const supabase = await createClient();
  const { data: boss } = await supabase.from("bosses").select("id, limiter, status").eq("athlete_id", athleteId).eq("month", monthOf(today)).maybeSingle();
  const active = boss?.status === "active";
  const { data: upcoming } = active
    ? await supabase.from("planned_workouts").select("id, title, scheduled_date, targets_boss").eq("athlete_id", athleteId).is("deleted_at", null).neq("status", "draft").gte("scheduled_date", today).order("scheduled_date").limit(14)
    : { data: [] };

  return (
    <section id="boss" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
      <h2 className="text-lg font-medium">Boss</h2>
      {!boss || boss.status === "skipped" ? (
        <>
          <p className="mt-1 text-sm text-white/55">No boss for {firstName} this month. Suggestions arrive on the 1st (approve them on Today), or pick one now.</p>
          <ChooseBoss athleteId={athleteId} />
        </>
      ) : boss.status === "suggested" ? (
        <p className="mt-1 text-sm text-white/55">Suggested: {BOSS[boss.limiter as Limiter].name} ({BOSS[boss.limiter as Limiter].limiter}). Approve it on Today.</p>
      ) : (
        <div className="[&>section]:mt-3">
          <BossCard athleteId={athleteId} viewer="coach" />
        </div>
      )}
      {active && (
        <div className="mt-4">
          <p className="text-sm font-medium">Aim sessions at it</p>
          <p className="mb-2 text-xs text-white/50">
            {boss.limiter === "consistency" ? "Every planned session finished hits Snoozlet; tagged ones are a nice reminder." : "Each tagged session that's finished takes 20 health off."}
          </p>
          {(upcoming ?? []).length ? (
            <div className="grid gap-0.5">
              {(upcoming ?? []).map((w) => (
                <TargetToggle key={w.id} id={w.id} on={Boolean(w.targets_boss)} title={w.title} date={w.scheduled_date} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">Nothing planned in the next two weeks.</p>
          )}
        </div>
      )}
    </section>
  );
}
