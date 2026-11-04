import { Check, CircleAlert, TrendingDown } from "lucide-react";

import ActivityCharts from "@/components/activity/ActivityCharts";
import Sparkline from "@/components/coach/Sparkline";
import type { Streams } from "@/lib/activity/fit";
import { baselineOf, drift, FORM, FORM_ORDER, judge, type FormRun, type FormSummary, type Status } from "@/lib/activity/form";

const STATUS: Record<Status, { label: string; dot: string; text: string; Icon: typeof Check }> = {
  green: { label: "Good", dot: "bg-emerald-300", text: "text-emerald-100", Icon: Check },
  yellow: { label: "Watch", dot: "bg-amber-300", text: "text-amber-100", Icon: CircleAlert },
  red: { label: "Work on", dot: "bg-red-400", text: "text-red-100", Icon: CircleAlert },
};

/** Running form for one run. `history` is the athlete's earlier runs with form data, newest first. */
export default function FormSection({
  form,
  history,
  streams,
  date,
}: {
  form: FormSummary;
  history: FormRun[];
  streams: Streams | null;
  date: string;
}) {
  const present = FORM_ORDER.filter((m) => form.metrics[m]);
  const missing = FORM_ORDER.filter((m) => !form.metrics[m]);
  const hasFormCharts = Boolean(streams && (streams.gct || streams.vo || streams.vr || streams.stride || streams.gct_bal));

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl sm:p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Form</h2>
        {history.length > 0 && <span className="text-xs text-white/45">Compared with {Math.min(history.length, 20)} earlier runs</span>}
      </div>
      <p className="mb-4 text-xs text-white/45">General training guidance from typical ranges and this athlete&apos;s own runs, not medical advice.</p>

      {present.length === 0 ? (
        <p className="text-sm text-white/55">No running dynamics were recorded on this run.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {present.map((m) => {
            const s = form.metrics[m]!;
            const meta = FORM[m];
            const base = baselineOf(history.slice(0, 20).map((r) => r.form.metrics[m]?.avg));
            const j = judge(m, s.avg, base);
            const d = drift(m, s, form.pace);
            const st = j.status ? STATUS[j.status] : null;
            const trend = [...history.slice(0, 9)].reverse().map((r) => ({ date: r.date, value: r.form.metrics[m]?.avg ?? null }));
            trend.push({ date, value: s.avg });
            const scale = m === "vo" ? 0.1 : 1; // trend shows cm like the headline
            return (
              <li key={m} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-sm font-medium text-white/85">{meta.label}</h3>
                    <span className="text-lg font-semibold tabular-nums">
                      {meta.format(s.avg)} <span className="text-sm font-normal text-white/50">{meta.unit}</span>
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
                  <p className={`mt-1 flex items-center gap-1.5 text-xs ${d.drifted ? "text-amber-100" : "text-white/45"}`}>
                    {d.drifted && <TrendingDown size={13} aria-hidden />}
                    Last third vs first: {d.text}
                    {d.drifted ? " — drifted with fatigue" : d.paceChanged && Math.abs(d.worse) > 0.02 ? " (pace changed, so not judged)" : ""}
                  </p>
                </div>
                <div className="sm:w-36">
                  <Sparkline
                    label="Recent runs"
                    points={trend.map((p) => ({ date: p.date, value: p.value === null ? null : p.value * scale }))}
                    format={(v) => (m === "vo" ? v.toFixed(1) : meta.format(v))}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasFormCharts && streams && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <ActivityCharts streams={streams} sport="running" set="form" />
        </div>
      )}

      {missing.length > 0 && (
        <details className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm">
          <summary className="cursor-pointer text-white/60">
            Not recorded on this run ({missing.map((m) => FORM[m].label.toLowerCase()).join(", ")})
          </summary>
          <ul className="mt-2 space-y-1.5 text-white/55">
            {missing.map((m) => (
              <li key={m}>
                <span className="text-white/75">{FORM[m].label}:</span> {FORM[m].gear}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
