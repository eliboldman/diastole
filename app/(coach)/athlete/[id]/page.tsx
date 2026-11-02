import Link from "next/link";

import DashboardShell from "@/components/layout/DashboardShell";

import CoachNotes from "./components/CoachNotes";

import InterventionRecommendations from "./components/InterventionRecommendations";

import { notes } from "@/data/notes";

import TrainingLoad from "./components/TrainingLoad";

import ReadinessForecast from "./components/ReadinessForecast";

import RecoveryTimeline from "./components/RecoveryTimeline";

import PhysiologicalSystems from "./components/PhysiologicalSystems";

import PhysiologyBackground from "@/components/PhysiologyBackground";

import { athletes } from "@/data/athletes";

import {
  calculateReadiness,
  generateInsights,
  generateTelemetry,
} from "@/lib/readiness";

type AthletePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AthletePage({
  params,
}: AthletePageProps) {
  const { id } = await params;

  const athlete = athletes.find(
    (athlete) => athlete.id === id
  );

  if (!athlete) {
    return (
      <main className="min-h-screen bg-neutral-950 p-10 text-white">
        <p>Athlete not found.</p>
      </main>
    );
  }

  const readiness =
    calculateReadiness(athlete);

  const insights =
    generateInsights(athlete);

  const telemetry =
    generateTelemetry(athlete);

    const athleteNotes = notes.filter(
  (note) => note.athleteId === athlete.id
);

  return (
    <DashboardShell>
  <div className="relative min-h-screen overflow-hidden text-white">
      <PhysiologyBackground
        variant="neural"
        stressOpacity={
          readiness.status === "Red"
            ? 0.18
            : readiness.status === "Yellow"
              ? 0.1
              : 0.06
        }
        focusTone={
          readiness.status === "Green"
            ? "green"
            : readiness.status === "Yellow"
              ? "yellow"
              : "red"
        }
      />

      <div className="relative z-10">
        <Link
  href="/dashboard"
  className="group inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-sm text-white/70 backdrop-blur-2xl transition-all duration-500 hover:border-emerald-300/20 hover:bg-white/[0.075] hover:text-white hover:shadow-[0_0_34px_rgba(110,231,183,0.10)]"
>
  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-300/15 bg-emerald-300/10 text-emerald-200 transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_18px_rgba(110,231,183,0.25)]">
    ←
  </span>

  <span className="tracking-tight">
    Return to Command Center
  </span>
</Link>

        <section className="mt-10 rounded-[42px] border border-white/10 bg-white/[0.045] p-10 backdrop-blur-3xl">
          <p className="text-sm uppercase tracking-[0.25em] text-white/35">
            Athlete Focus
          </p>

          <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-6xl font-bold tracking-tight">
                {athlete.name}
              </h1>

              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/60">
                Focused physiological analysis workspace
                for readiness, recovery trajectory, and
                coach intervention.
              </p>
            </div>

            <div className="relative flex h-44 w-44 items-center justify-center">
              <svg
                className="absolute inset-0 h-44 w-44 -rotate-90"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="10"
                  fill="none"
                />

                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${
                    readiness.score * 2.64
                  } 999`}
                  className={readiness.color}
                />
              </svg>

              <div className="text-center">
                <p className="text-5xl font-bold">
                  {readiness.score}
                </p>

                <p
                  className={`mt-1 text-sm ${readiness.color}`}
                >
                  {readiness.status}
                </p>
              </div>
            </div>
          </div>
        </section>

<RecoveryTimeline history={athlete.history}/>

<PhysiologicalSystems athlete={athlete} />

<ReadinessForecast athlete={athlete} />

<InterventionRecommendations athlete={athlete} />

<TrainingLoad athlete={athlete} />

<CoachNotes notes={athleteNotes} />

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          {telemetry.map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-6"
            >
              <p className="text-sm text-white/35">
                {item.label}
              </p>

              <h2
                className={`mt-3 text-3xl font-semibold ${item.tone}`}
              >
                {item.value}
              </h2>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-white/35">
              AI Interpretation
            </p>

            <p className="mt-4 text-lg leading-relaxed text-white/65">
              {readiness.message} Current
              physiological signals indicate this
              athlete should be managed according to
              today’s readiness state.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-white/35">
              Key Signals
            </p>

            <div className="mt-4 space-y-3">
              {insights.map((insight) => (
                <div
                  key={insight}
                  className="rounded-2xl border border-white/10 bg-[#0b0b0b]/90 px-4 py-3 text-white/60"
                >
                  {insight}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      </div>
</DashboardShell>
  );
}