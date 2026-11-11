import { Mountain } from "lucide-react";

import type { CourseView } from "@/lib/course/data";
import { fmt } from "@/lib/predict/predict";

import RideButtons from "@/components/RideButtons";

import CourseSessions from "./CourseSessions";
import CourseUpload from "./CourseUpload";
import ElevationProfile from "./ElevationProfile";
import PacingPlan from "./PacingPlan";
import { dist, ele, type U } from "./units";

const card = "rounded-[28px] border border-white/10 bg-white/[0.055] p-6";

function Outline({ path }: { path: [number, number][] }) {
  const d = path.map((p, i) => `${i ? "L" : "M"}${(4 + p[0] * 92).toFixed(1)},${(4 + p[1] * 92).toFixed(1)}`).join("");
  const [sx, sy] = path[0];
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0" aria-hidden>
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-emerald-200/80" />
      <circle cx={4 + sx * 92} cy={4 + sy * 92} r={3.5} className="fill-emerald-300" />
    </svg>
  );
}

function Bar({ label, score, detail }: { label: string; score: number; detail: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-white/60">{score}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${score >= 80 ? "bg-emerald-300" : score >= 50 ? "bg-emerald-300/60" : "bg-amber-200/70"}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
      <p className="mt-1 text-xs text-white/45">{detail}</p>
    </li>
  );
}

/** The race's course: profile, course-aware estimate, readiness, pacing plan, rehearsal sessions. */
export default function CourseCard({ raceId, athleteId, sport, view, units, coach, today, raceDate }: { raceId: string; athleteId: string; sport: string; view: CourseView | null; units: U; coach: boolean; today: string; raceDate: string }) {
  if (sport === "swim" || sport === "other") return null;
  if (!view)
    return (
      <section className={`${card} lg:col-span-2`}>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Mountain size={18} className="text-emerald-200" aria-hidden /> Course
        </h2>
        <p className="mb-4 mt-1 text-sm text-white/55">Add the course to see its hills, an estimate for this course, a pacing plan, and sessions that rehearse it.</p>
        <CourseUpload raceId={raceId} sport={sport} hasCourse={false} />
      </section>
    );
  const c = view.course;
  const extra = view.estimate ? view.estimate.course - view.estimate.flat : 0;
  const lastDay = new Date(Date.parse(`${raceDate}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const main = [...c.climbs].sort((a, b) => b.gain_m - a.gain_m)[0];
  return (
    <>
      <section className={`${card} lg:col-span-2`}>
        <div className="flex items-start gap-4">
          <Outline path={c.path} />
          <div className="min-w-0 flex-1">
            <h2 className="flex items-start gap-2 text-lg font-medium leading-snug">
              <Mountain size={18} className="mt-1 shrink-0 text-emerald-200" aria-hidden />
              <span className="min-w-0 break-words">{view.name || "Course"}</span>
            </h2>
            <p className="mt-1 text-sm text-white/60">
              {[sport === "tri" ? `${view.leg === "bike" ? "Bike" : "Run"} course` : null, dist(c.distance_m, units), `${ele(c.gain_m, units)} up`, `${c.climbs.length} climb${c.climbs.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
            </p>
            {main && (
              <p className="mt-1 text-xs text-white/45">
                Biggest climb: {dist(main.end_m - main.start_m, units)} at {main.grade}% from {dist(main.start_m, units)}
              </p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <ElevationProfile profile={c.profile} climbs={c.climbs} units={units} />
        </div>
        {view.estimate && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-wider text-white/45">On this course</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(view.estimate.course)}</p>
            <p className="text-sm text-white/55">{extra > 30 ? `About ${fmt(extra)} slower than flat for the hills.` : extra < -30 ? `About ${fmt(-extra)} faster than flat (net downhill).` : "About the same as a flat course."}</p>
            {view.basis && <p className="mt-1 text-xs text-white/40">{view.basis} An estimate, not a guarantee.</p>}
          </div>
        )}
        {!view.estimate && <p className="mt-4 text-sm text-white/55">{view.leg === "bike" ? "Add FTP in zones" : "Add threshold pace or a few hard runs"} to see a time for this course and a pacing plan.</p>}
        <details className="mt-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-emerald-200">Replace or remove the course</summary>
          <div className="mt-2">
            <CourseUpload raceId={raceId} sport={sport} hasCourse />
          </div>
        </details>
      </section>

      {view.readiness && (
        <section className={card}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium">Course readiness</h2>
            <span className="text-2xl font-semibold tabular-nums">{view.readiness.score}%</span>
          </div>
          <p className="mt-1 text-xs text-white/45">From the last 6 weeks of {view.leg === "bike" ? "riding" : "running"}.</p>
          <ul className="mt-4 grid gap-4">
            {view.readiness.parts.map((p) => (
              <Bar key={p.key} label={p.label} score={p.score} detail={p.detail} />
            ))}
          </ul>
        </section>
      )}

      {view.leg === "bike" && !coach && (
        <section className={card}>
          <h2 className="text-lg font-medium">Ride it on your trainer</h2>
          <p className="mt-1 text-sm text-white/55">
            The whole course on your smart trainer: every climb and descent changes the resistance, with distance, grade and what&apos;s coming on screen. Your speed comes from your power and weight, so it&apos;s an honest rehearsal.
          </p>
          <RideButtons courseId={raceId} />
        </section>
      )}

      <section className={card}>
        <h2 className="text-lg font-medium">Rehearse it</h2>
        <p className="mb-4 mt-1 text-sm text-white/55">{coach ? "Sessions built from this course. Add one as a draft, then review and send it to the watch like any workout." : "Sessions built from this course. Your coach can put them on your calendar."}</p>
        <CourseSessions raceId={raceId} athleteId={athleteId} sessions={view.sessions} added={view.added} coach={coach} defaultDate={today} maxDate={lastDay} />
      </section>

      {view.pacing.length > 0 && (
        <section className={`${card} lg:col-span-2`}>
          <h2 className="text-lg font-medium">Race-day pacing</h2>
          <p className="mb-4 mt-1 text-sm text-white/55">
            {view.leg === "bike" ? "A little more power up the climbs, back off down the descents." : "Even effort, not even pace: slower up, quicker down."} {view.pacingEdited ? "Edited." : "Suggested from the course; change anything."}
          </p>
          <PacingPlan key={JSON.stringify(view.pacing)} raceId={raceId} leg={view.leg} rows={view.pacing} edited={view.pacingEdited} units={units} />
        </section>
      )}
    </>
  );
}
