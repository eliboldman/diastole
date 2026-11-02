export default async function AthletePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;

  const athleteName = decodeURIComponent(name);

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <p className="text-sm text-neutral-400">Athlete Detail</p>

        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          {athleteName}
        </h1>

        <p className="mt-3 text-neutral-400">
          Full readiness profile, recovery trends, and AI workout guidance.
        </p>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <p className="text-sm text-neutral-400">Readiness</p>
            <h2 className="mt-3 text-5xl font-bold text-green-400">88</h2>
            <p className="mt-2 text-neutral-300">Green — Ready</p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <p className="text-sm text-neutral-400">Primary Limiter</p>
            <h2 className="mt-3 text-2xl font-semibold">Low fatigue</h2>
            <p className="mt-2 text-neutral-300">
              Recovery markers are stable.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
            <p className="text-sm text-neutral-400">Recommendation</p>
            <h2 className="mt-3 text-2xl font-semibold">Proceed</h2>
            <p className="mt-2 text-neutral-300">
              Complete planned workout as written.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">HRV</p>
            <h3 className="mt-2 text-3xl font-bold">78</h3>
            <p className="mt-1 text-sm text-green-400">Above baseline</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Resting HR</p>
            <h3 className="mt-2 text-3xl font-bold">42</h3>
            <p className="mt-1 text-sm text-green-400">Stable</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Sleep</p>
            <h3 className="mt-2 text-3xl font-bold">8.1h</h3>
            <p className="mt-1 text-sm text-green-400">Optimal</p>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-sm text-neutral-400">Soreness</p>
            <h3 className="mt-2 text-3xl font-bold">2/10</h3>
            <p className="mt-1 text-sm text-yellow-400">Mild fatigue</p>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
          <p className="text-sm text-neutral-400">AI Interpretation</p>

          <p className="mt-3 text-lg leading-relaxed text-neutral-200">
            This athlete is showing strong readiness today. HRV is above
            baseline, resting heart rate is stable, sleep duration is adequate,
            and soreness is low. No workout modification is recommended.
          </p>
        </section>
      </div>
    </main>
  );
}