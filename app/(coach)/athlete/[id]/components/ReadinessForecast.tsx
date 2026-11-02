import type { Athlete } from "@/types/athlete";
import { scoreToTone, toneToBorderGlow, toneToTextColor } from "@/lib/status";

export default function ReadinessForecast({
  athlete,
}: {
  athlete: Athlete;
}) {
  const lastScore =
    athlete.history[athlete.history.length - 1].readiness;

  const forecast = [
    { label: "Today", score: lastScore },
    { label: "+24h", score: Math.min(100, lastScore + 4) },
    { label: "+48h", score: Math.min(100, lastScore + 8) },
  ];

  const recoveryHorizon =
    lastScore >= 75
      ? "Ready now"
      : lastScore >= 55
        ? "24–48 hours"
        : "48–72 hours";

  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-white/35">
          Readiness Forecast
        </p>

        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Projected Recovery Horizon
        </h2>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {forecast.map((item) => {
          const tone = scoreToTone(item.score);

          return (
            <div
              key={item.label}
              className={`rounded-3xl border bg-[#0b0b0b]/90 p-5 ${toneToBorderGlow(
                tone
              )}`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-white/35">
                {item.label}
              </p>

              <p className={`mt-4 text-4xl font-bold ${toneToTextColor(tone)}`}>
                {item.score}
              </p>

              <p className="mt-3 text-sm text-white/45">
                Projected readiness
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-white/35">
          AI Recovery Estimate
        </p>

        <p className="mt-3 text-lg leading-relaxed text-white/65">
          Estimated recovery horizon:{" "}
          <span className="font-semibold text-white/80">{recoveryHorizon}</span>.
          Projection assumes reduced systemic load, adequate sleep, and no added
          high-intensity work during the next recovery window.
        </p>
      </div>
    </section>
  );
}