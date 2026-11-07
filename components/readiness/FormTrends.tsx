import { Check, CircleAlert, TrendingDown } from "lucide-react";

import Sparkline from "@/components/coach/Sparkline";
import { baselineOf, detectPatterns, FORM, FORM_ORDER, judge, type FormRun, type Status } from "@/lib/activity/form";

const STATUS: Record<Status, { label: string; dot: string; text: string; Icon: typeof Check }> = {
  green: { label: "Good", dot: "bg-emerald-300", text: "text-emerald-100", Icon: Check },
  yellow: { label: "Watch", dot: "bg-amber-300", text: "text-amber-100", Icon: CircleAlert },
  red: { label: "Work on", dot: "bg-red-400", text: "text-red-100", Icon: CircleAlert },
};

/**
 * Running form across recent runs (newest first): each metric's latest value judged against the
 * usual, a trend over the last 10 runs, and the rule-based patterns the coach's form check uses.
 */
export default function FormTrends({ runs }: { runs: FormRun[] }) {
  if (!runs.length) {
    return <p className="text-sm text-white/55">No running dynamics yet. They appear after runs recorded with a watch or strap that measures them.</p>;
  }
  const patterns = detectPatterns(runs);
  const present = FORM_ORDER.filter((m) => runs.some((r) => r.form.metrics[m]));

  return (
    <>
      {patterns.length > 0 && (
        <ul className="mb-4 space-y-2">
          {patterns.map((p) => (
            <li key={p.key} className="flex gap-2 rounded-2xl border border-amber-200/20 bg-amber-200/[0.05] px-4 py-3 text-sm text-amber-50/90">
              {p.kind === "fatigue" ? <TrendingDown size={16} className="mt-0.5 shrink-0" aria-hidden /> : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
              <span>
                <span className="font-medium">{FORM[p.metric].label}</span>{" "}
                {p.kind === "fatigue" ? `drifted late in ${p.runs} of the last ${p.of} runs` : `was outside the usual or common range in ${p.runs} of the last ${p.of} runs`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-white/10">
        {present.map((m) => {
          const meta = FORM[m];
          const i = runs.findIndex((r) => r.form.metrics[m]);
          const latest = runs[i];
          const value = latest.form.metrics[m]!.avg;
          const j = judge(m, value, baselineOf(runs.slice(i + 1, i + 21).map((r) => r.form.metrics[m]?.avg)));
          const st = j.status ? STATUS[j.status] : null;
          const scale = m === "vo" ? 0.1 : 1; // the trend shows cm like the headline
          const trend = runs
            .slice(0, 10)
            .reverse()
            .map((r) => ({ date: r.date, value: r.form.metrics[m] ? r.form.metrics[m]!.avg * scale : null }));
          return (
            <li key={m} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-sm font-medium text-white/85">{meta.label}</h3>
                  <span className="text-lg font-semibold tabular-nums">
                    {meta.format(value)} <span className="text-sm font-normal text-white/50">{meta.unit}</span>
                  </span>
                  {st && (
                    <span className={`inline-flex items-center gap-1.5 text-xs ${st.text}`}>
                      <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
                      <st.Icon size={13} aria-hidden />
                      {st.label}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-white/65">{j.line}</p>
                <p className="mt-1 text-xs text-white/45">Latest run with this metric: {latest.date}</p>
              </div>
              <div className="sm:w-36">
                <Sparkline label="Last 10 runs" points={trend} format={(v) => (m === "vo" ? v.toFixed(1) : meta.format(v))} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
