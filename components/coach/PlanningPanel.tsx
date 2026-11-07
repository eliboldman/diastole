import AthleteNotes from "@/components/coach/AthleteNotes";
import PlanBatch from "@/components/coach/PlanBatch";
import PlanSuggester from "@/components/coach/PlanSuggester";
import WeekPrefsEditor from "@/components/WeekPrefsEditor";
import { createClient } from "@/lib/supabase/server";
import { cleanWeek, hasWeek } from "@/lib/week-prefs";

const card = "rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

/** Suggested workouts for one athlete; with `full`, also the coach's notes and the athlete's preferred week. */
export default async function PlanningPanel({ athleteId, coachId, firstName, full = false }: { athleteId: string; coachId: string; firstName: string; full?: boolean }) {
  const supabase = await createClient();
  const [{ data: settings }, { data: notes }, { data: week }] = await Promise.all([
    supabase.from("coach_settings").select("philosophy").eq("coach_id", coachId).maybeSingle(),
    supabase.from("athlete_coaching").select("notes").eq("athlete_id", athleteId).maybeSingle(),
    supabase.from("athlete_week").select("days").eq("athlete_id", athleteId).maybeSingle(),
  ]);
  const w = cleanWeek(week?.days);
  return (
    <div className="grid gap-6">
      <section className={card}>
        <h2 className="text-lg font-medium">Suggest workouts</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Drafts from your coaching guide and {firstName}&apos;s data: recent training, recovery, check-ins, races and preferred week.</p>
        <PlanSuggester athleteId={athleteId} firstName={firstName} ready={{ guide: Boolean(settings?.philosophy?.trim()), notes: Boolean(notes?.notes?.trim()), week: hasWeek(w) }} />
      </section>
      <PlanBatch athleteId={athleteId} />
      {full && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className={card}>
            <h2 className="text-lg font-medium">Your notes on {firstName}</h2>
            <p className="mb-3 mt-1 text-sm text-white/55">Goal, period, numbers and constraints the planner should know.</p>
            <AthleteNotes athleteId={athleteId} initial={notes?.notes ?? ""} firstName={firstName} />
          </section>
          <section className={card}>
            <h2 className="text-lg font-medium">{firstName}&apos;s preferred week</h2>
            <p className="mb-3 mt-1 text-sm text-white/55">Set by {firstName} in Me. You can adjust it too.</p>
            <WeekPrefsEditor initial={w} athleteId={athleteId} />
          </section>
        </div>
      )}
    </div>
  );
}
