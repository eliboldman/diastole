import { Timer } from "lucide-react";

import type { PredictionView } from "@/lib/predict/data";

import { HideToggle, NoteForm } from "./PredictControls";
import PredictionList from "./PredictionList";

const FOOT = "Estimates from recent training, for a flat course in good conditions. A guide for pacing and goals, not a guarantee.";

/** Race estimates for the standard distances. Athlete: with a hide toggle. Coach: with a note for the athlete. */
export default function PredictionsCard({ view, coach, athleteId, firstName }: { view: PredictionView; coach?: boolean; athleteId?: string; firstName?: string }) {
  const head = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Timer size={18} className="text-emerald-200" aria-hidden /> Race estimates
        </h2>
        {coach && view.hidden && <p className="mt-0.5 text-xs text-white/45">{firstName ?? "The athlete"} has these hidden on their side.</p>}
      </div>
      {!coach && <HideToggle hidden={view.hidden} />}
    </div>
  );
  if (!coach && view.hidden)
    return (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        {head}
        <p className="mt-1 text-sm text-white/50">Hidden. Your coach can still see them.</p>
      </section>
    );
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
      {head}
      {view.note && !coach && (
        <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-50/90">
          <span className="text-xs uppercase tracking-wider text-emerald-200/70">Coach</span>
          <br />
          {view.note.text}
        </p>
      )}
      <div className="mt-4">
        <PredictionList predictions={view.predictions} trends={view.trends} />
      </div>
      {coach && athleteId && <NoteForm athleteId={athleteId} initial={view.note?.text ?? ""} />}
      <p className="mt-4 text-xs text-white/40">{FOOT}</p>
    </section>
  );
}
