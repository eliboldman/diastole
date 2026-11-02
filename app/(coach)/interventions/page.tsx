import DashboardShell from "@/components/layout/DashboardShell";
import PhysiologyBackground from "@/components/PhysiologyBackground";
import { notes } from "@/data/notes";

export default function InterventionsPage() {
  return (
    <DashboardShell>
      <PhysiologyBackground
        variant="atmosphere"
        stressOpacity={0.12}
        systemTone="yellow"
      />

      <div className="relative z-10">
        <p className="text-sm uppercase tracking-[0.25em] text-white/35">
          Intervention Center
        </p>

        <h1 className="mt-4 text-5xl font-bold tracking-tight">
          Interventions
        </h1>

        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/55">
          Review active recommendations, coach actions, and physiological
          response monitoring across the roster.
        </p>

        <section className="mt-10 grid gap-5">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-3xl border border-white/10 bg-[#0b0b0b]/90 p-6"
            >
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-white/35">
                    {note.athleteId}
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold">
                    {note.title}
                  </h2>

                  <p className="mt-3 leading-relaxed text-white/55">
                    {note.body}
                  </p>
                </div>

                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                  {note.severity}
                </span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </DashboardShell>
  );
}