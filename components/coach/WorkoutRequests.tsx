import { createClient } from "@/lib/supabase/server";
import { describe } from "@/lib/workouts/describe";
import type { Pool, Step } from "@/lib/workouts/garmin-format";

import RequestActions from "@/components/coach/RequestActions";

/** Workouts athletes asked to add. Approve sends them like any workout; hidden when there are none. */
export default async function WorkoutRequests({ coachId, units }: { coachId: string; units: "mi" | "km" }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("planned_workouts")
    .select("id, athlete_id, title, sport, scheduled_date, steps, pool_length, pool_unit, profiles!planned_workouts_athlete_id_fkey(full_name)")
    .eq("coach_id", coachId)
    .eq("status", "draft")
    .not("requested_by", "is", null)
    .is("declined_at", null)
    .is("deleted_at", null)
    .order("scheduled_date")
    .limit(20);
  if (!data?.length) return null;
  return (
    <section id="requests" className="mt-6 scroll-mt-6 rounded-[28px] border border-sky-200/15 bg-sky-200/[0.04] p-5">
      <h2 className="text-lg font-medium">Workout requests</h2>
      <ul className="mt-3 space-y-3">
        {data.map((w) => {
          const pool: Pool = w.pool_length && w.pool_unit ? { length: Number(w.pool_length), unit: w.pool_unit as "METER" | "YARD" } : null;
          const who = ((w.profiles as unknown as { full_name: string | null } | null)?.full_name ?? "Athlete").split(" ")[0];
          const when = new Date(`${w.scheduled_date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <li key={w.id} className="rounded-2xl bg-white/[0.04] p-3">
              <p className="text-xs text-white/50">
                {who} · {when}
              </p>
              <p className="font-medium">{w.title}</p>
              <p className="text-xs text-white/55">{describe(w.steps as Step[], units, pool, w.sport === "swim").slice(0, 3).join(" · ")}</p>
              <RequestActions id={w.id} editHref={`/athlete/${w.athlete_id}/workouts/${w.id}`} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
