import { PriorityList, ResultList } from "@/components/mobility/Results";
import { screensFor, sportMix } from "@/lib/mobility/data";
import { priorities } from "@/lib/mobility/screen";
import { createClient } from "@/lib/supabase/server";

const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The athlete's latest mobility screen for their head coach (row-level security hides it from anyone else). */
export default async function MobilityCoachCard({ athleteId, today, firstName }: { athleteId: string; today: string; firstName: string }) {
  const supabase = await createClient();
  const [screens, mix] = await Promise.all([screensFor(supabase, athleteId, 6), sportMix(supabase, athleteId, today)]);
  const s = screens[0];
  return (
    <section id="mobility" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6 lg:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Mobility</h2>
        {s && (
          <p className="text-sm text-white/55">
            <span className="text-2xl font-semibold tabular-nums text-white">{s.score}</span>/100 · {fmt(s.taken_on)}
            {screens[1] && ` · was ${screens[1].score} on ${fmt(screens[1].taken_on)}`}
          </p>
        )}
      </div>
      {!s ? (
        <p className="mt-2 text-sm text-white/55">{`No mobility screen to show. ${firstName} can take it from Recovery → Mobility.`}</p>
      ) : (
        <>
          <p className="mb-3 mt-1 text-sm text-white/55">Their daily flow targets these, fitted around each day&apos;s training.</p>
          <PriorityList pri={priorities(s.results, mix)} />
          <div className="mt-4">
            <ResultList results={s.results} />
          </div>
        </>
      )}
    </section>
  );
}
