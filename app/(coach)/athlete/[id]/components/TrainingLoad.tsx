import type { Athlete } from "@/types/athlete";
import { scoreToTone, toneToBorderGlow, toneToTextColor } from "@/lib/status";

export default function TrainingLoad({
  athlete,
}: {
  athlete: Athlete;
}) {
  const sessions = [
    {
      title: "Threshold Run",
      load: 82,
      impact: "High autonomic cost",
      recommendation: "Reduce next intensity block",
    },
    {
      title: "Endurance Ride",
      load: 64,
      impact: "Moderate aerobic load",
      recommendation: "Maintain aerobic volume",
    },
    {
      title: "Recovery Swim",
      load: 28,
      impact: "Low systemic cost",
      recommendation: "Useful recovery stimulus",
    },
  ];

  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-white/35">
          Training Load
        </p>

        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Recent Session Cost
        </h2>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {sessions.map((session) => {
          const tone = scoreToTone(100 - session.load);

          return (
            <div
              key={session.title}
              className={`rounded-3xl border bg-[#0b0b0b]/90 p-5 ${toneToBorderGlow(
                tone
              )}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                Session
              </p>

              <h3 className="mt-3 text-2xl font-semibold">
                {session.title}
              </h3>

              <p className={`mt-5 text-4xl font-bold ${toneToTextColor(tone)}`}>
                {session.load}
              </p>

              <p className="mt-2 text-sm text-white/40">
                Load cost
              </p>

              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-sm text-white/45">
                  {session.impact}
                </p>

                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  {session.recommendation}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-white/35">
          AI Session Interpretation
        </p>

        <p className="mt-3 text-lg leading-relaxed text-white/65">
          Recent session cost suggests this athlete’s next quality workout
          should be evaluated against readiness, sleep, and HRV response rather
          than planned load alone.
        </p>
      </div>
    </section>
  );
}