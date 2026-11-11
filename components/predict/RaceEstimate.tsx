import { Timer } from "lucide-react";

import { fmt, goalVerdict, type Prediction } from "@/lib/predict/predict";

import { Splits } from "./PredictionList";

const TONE = { good: "text-emerald-200", near: "text-amber-100", far: "text-amber-200/80" } as const;

/** This race's estimate against the goal, with triathlon splits. */
export default function RaceEstimate({ prediction, goal, note, own }: { prediction: Prediction | null; goal: number | null; note: { text: string } | null; own: boolean }) {
  if (!prediction)
    return (
      <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-sm text-white/55">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium text-white">
          <Timer size={18} className="text-emerald-200" aria-hidden /> Estimate
        </h2>
        Add a distance, and a few hard efforts or zones (threshold pace, FTP, CSS), to see an estimate for this race.
      </section>
    );
  const v = goalVerdict(goal, prediction.range);
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Timer size={18} className="text-emerald-200" aria-hidden /> Estimate
      </h2>
      <p className="mt-2 text-4xl font-semibold tabular-nums">{fmt(prediction.range.mid)}</p>
      <p className="text-sm tabular-nums text-white/50">
        likely {fmt(prediction.range.low)}–{fmt(prediction.range.high)}
        {prediction.confidence === "rough" ? " · rough, more data sharpens it" : ""}
      </p>
      {v && <p className={`mt-2 text-sm font-medium ${TONE[v.tone]}`}>{v.label}</p>}
      {prediction.splits && <Splits splits={prediction.splits} />}
      {note && (
        <p className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-50/90">
          <span className="text-xs uppercase tracking-wider text-emerald-200/70">{own ? "Coach" : "Your note"}</span>
          <br />
          {note.text}
        </p>
      )}
      <p className="mt-3 text-xs text-white/40">From recent training, assuming a flat course and good conditions. Hills, heat and wind add time. A guide, not a guarantee.</p>
    </section>
  );
}
