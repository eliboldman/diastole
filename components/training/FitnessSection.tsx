import FitnessChart from "@/components/training/FitnessChart";
import type { LoadView } from "@/lib/training/load-data";

/** Fitness, fatigue and form card. `view` null = no activities in the last six months. */
export default function FitnessSection({ view, you = false }: { view: LoadView | null; you?: boolean }) {
  const s = view?.sources;
  const how = s
    ? [s.power && `power on ${s.power}`, s.pace && `pace on ${s.pace}`, s.hr && `heart rate on ${s.hr}`, s.rpe && `effort (RPE) on ${s.rpe}`, s.time && `time only on ${s.time}`].filter(Boolean).join(", ")
    : "";
  return (
    <section id="fitness" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <h2 className="text-lg font-medium">Fitness and fatigue</h2>
      {!view ? (
        <p className="mt-2 text-sm text-white/55">{you ? "Your" : "The"} trend appears once there are workouts from the last few months.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-white/50">
            Last 90 days{view.days.some((d) => d.planned) ? " and the next two weeks of planned workouts" : ""}. One hour flat out at threshold scores 100.
          </p>
          <div className="mt-4">
            <FitnessChart view={view} />
          </div>
          {how && (
            <p className="mt-2 text-xs text-white/45">
              Scored from {how} {view.sessions === 1 ? "session" : "sessions"}.
              {s && s.time > s.power + s.pace + s.hr + s.rpe ? " Setting FTP, threshold pace and max heart rate in Training zones makes this more accurate." : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}
