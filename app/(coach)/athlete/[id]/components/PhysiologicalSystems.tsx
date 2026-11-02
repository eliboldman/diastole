import type { Athlete } from "@/types/athlete";
import { scoreToTone, toneToBorderGlow, toneToTextColor } from "@/lib/status";

export default function PhysiologicalSystems({
  athlete,
}: {
  athlete: Athlete;
}) {
  const systems = [
    {
      label: "Autonomic Load",
      value:
        athlete.hrv >= athlete.baselineHrv
          ? "Regulated"
          : athlete.hrv >= athlete.baselineHrv - 10
            ? "Elevated"
            : "Suppressed",
      score:
        athlete.hrv >= athlete.baselineHrv
          ? 85
          : athlete.hrv >= athlete.baselineHrv - 10
            ? 65
            : 45,
    },
    {
      label: "Sleep Recovery",
      value:
        athlete.sleep >= 8
          ? "Restored"
          : athlete.sleep >= 6.5
            ? "Partial"
            : "Limited",
      score: athlete.sleep >= 8 ? 85 : athlete.sleep >= 6.5 ? 65 : 45,
    },
    {
      label: "Muscular Strain",
      value:
        athlete.soreness <= 3
          ? "Low"
          : athlete.soreness <= 6
            ? "Moderate"
            : "High",
      score: athlete.soreness <= 3 ? 85 : athlete.soreness <= 6 ? 65 : 45,
    },
    {
      label: "Adaptation Readiness",
      value:
        athlete.hrv >= athlete.baselineHrv && athlete.sleep >= 7.5
          ? "Favorable"
          : athlete.sleep >= 6.5
            ? "Cautious"
            : "Compromised",
      score:
        athlete.hrv >= athlete.baselineHrv && athlete.sleep >= 7.5
          ? 85
          : athlete.sleep >= 6.5
            ? 65
            : 45,
    },
  ];

  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-white/35">
          Physiological Systems
        </p>

        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Current Internal Load Profile
        </h2>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {systems.map((system) => {
          const tone = scoreToTone(system.score);

          return (
            <div
              key={system.label}
              className={`rounded-3xl border bg-[#0b0b0b]/90 p-5 ${toneToBorderGlow(
                tone
              )}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                {system.label}
              </p>

              <p
                className={`mt-4 text-2xl font-semibold ${toneToTextColor(
                  tone
                )}`}
              >
                {system.value}
              </p>

              <p className="mt-3 text-sm leading-relaxed text-white/45">
                System score: {system.score}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}