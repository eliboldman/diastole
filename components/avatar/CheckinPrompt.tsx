import Link from "next/link";

import StrainPrompt from "@/components/avatar/StrainPrompt";
import { sportLabel } from "@/lib/activity/format";
import { FEEL } from "@/lib/avatar/pain";
import { createClient } from "@/lib/supabase/server";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/**
 * Right after a workout: "How did it feel?" with the five faces on the card. One tap saves the
 * feel and opens the rest of the check-in. Once checked in, the muscles-worked prompt takes over.
 */
export default async function CheckinPrompt({ athleteId }: { athleteId: string }) {
  const supabase = await createClient();
  const { data: recent } = await supabase
    .from("activities")
    .select("id, name, sport, start_time, duration_s, workout_checkins(activity_id)")
    .eq("athlete_id", athleteId)
    .gte("start_time", hoursAgo(36))
    .gte("duration_s", 300)
    .order("start_time", { ascending: false })
    .limit(3);
  const open = (recent ?? []).find((a) => {
    const c = a.workout_checkins as unknown;
    return !c || (Array.isArray(c) && c.length === 0);
  });
  if (!open) return <StrainPrompt athleteId={athleteId} />;
  const title = open.name || sportLabel(open.sport);
  return (
    <section className="row-in mt-6 rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.05] p-5 backdrop-blur-xl">
      <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-100/70">Check-in</p>
      <h2 className="mt-1 truncate text-lg font-medium">{`How did your ${title} feel?`}</h2>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {FEEL.map((f) => (
          <Link
            key={f.v}
            href={`/activity/${open.id}?feel=${f.v}#checkin`}
            aria-label={f.label}
            className="flex min-h-16 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.09]"
          >
            <span className="text-2xl" aria-hidden>
              {f.emoji}
            </span>
            <span className="mt-0.5 text-[11px] text-white/60">{f.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
