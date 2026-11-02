import type { Athlete } from "@/types/athlete";
import { calculateReadiness } from "@/lib/readiness";

export default function InterventionRecommendations({
  athlete,
}: {
  athlete: Athlete;
}) {
  const readiness = calculateReadiness(athlete);

  const recommendations = [];

  if (readiness.status === "Green") {
    recommendations.push({
      title: "Proceed With Planned Load",
      body: "Recovery markers support completing the planned session as written.",
      priority: "Low",
    });
  }

  if (readiness.status === "Yellow") {
    recommendations.push({
      title: "Reduce Intensity Exposure",
      body: "Reduce high-intensity volume by 15–25% while maintaining aerobic structure.",
      priority: "Moderate",
    });

    recommendations.push({
      title: "Protect Sleep Window",
      body: "Prioritize an extended sleep opportunity tonight to support autonomic recovery.",
      priority: "Moderate",
    });
  }

  if (readiness.status === "Red") {
    recommendations.push({
      title: "Replace Quality Work",
      body: "Replace intensity with low aerobic recovery or full rest depending on subjective fatigue.",
      priority: "High",
    });

    recommendations.push({
      title: "Monitor Next-Morning Response",
      body: "Reassess HRV, resting HR, soreness, and sleep before reintroducing workload.",
      priority: "High",
    });
  }

  return (
    <section className="mt-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-7 backdrop-blur-2xl">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-white/35">
          Intervention Recommendations
        </p>

        <h2 className="mt-2 text-3xl font-semibold tracking-tight">
          Suggested Coaching Actions
        </h2>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        {recommendations.map((recommendation) => (
          <div
            key={recommendation.title}
            className="rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-semibold text-white/85">
                {recommendation.title}
              </h3>

              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                {recommendation.priority}
              </span>
            </div>

            <p className="mt-4 leading-relaxed text-white/60">
              {recommendation.body}
            </p>

            <button className="mt-6 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200">
              Apply Recommendation
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}