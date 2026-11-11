import { TrendingDown, TrendingUp } from "lucide-react";

import { fmt, type Prediction, type Split } from "@/lib/predict/predict";
import type { Trend } from "@/lib/predict/data";

const LEG: Record<Split["leg"], string> = { swim: "Swim", t1: "T1", bike: "Bike", t2: "T2", run: "Run" };
const since = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function TrendChip({ trend }: { trend?: Trend }) {
  if (!trend) return null;
  if (trend.seconds === 0) return <span className="text-[11px] text-white/40">steady since {since(trend.since)}</span>;
  const faster = trend.seconds < 0;
  const Icon = faster ? TrendingDown : TrendingUp;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${faster ? "text-emerald-200" : "text-amber-200/80"}`}>
      <Icon size={12} aria-hidden />
      {fmt(Math.abs(trend.seconds))} {faster ? "faster" : "slower"} since {since(trend.since)}
    </span>
  );
}

export function Splits({ splits }: { splits: Split[] }) {
  return (
    <div className="mt-2 grid grid-cols-[1fr_0.7fr_1.3fr_0.7fr_1.3fr] gap-1 text-center">
      {splits.map((s) => (
        <span key={s.leg} className="min-w-0 rounded-xl bg-white/[0.04] px-0.5 py-1.5">
          <span className="block text-[10px] uppercase tracking-wider text-white/45">{LEG[s.leg]}</span>
          <span className="block text-xs tabular-nums text-white/85">{fmt(s.range.mid)}</span>
        </span>
      ))}
    </div>
  );
}

/** Each standard distance: the estimate, its range, trend, and what it's based on. */
export default function PredictionList({ predictions, trends }: { predictions: Prediction[]; trends: Record<string, Trend> }) {
  const shown = predictions.filter((p) => p.range.mid > 0);
  const missing = predictions.filter((p) => !p.range.mid);
  if (!shown.length)
    return <p className="text-sm text-white/55">Not enough to go on yet. A few hard runs with GPS, or threshold pace, FTP and CSS in zones, and estimates show up here.</p>;
  return (
    <div>
      <ul className="grid gap-2">
        {shown.map((p) => (
          <li key={p.key}>
            <details className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 basis-28">
                  <span className="block font-medium">{p.label}</span>
                  <TrendChip trend={trends[p.key]} />
                </span>
                <span className="text-right">
                  <span className="block text-lg font-semibold tabular-nums">{fmt(p.range.mid)}</span>
                  <span className="block text-[11px] tabular-nums text-white/45">
                    {fmt(p.range.low)}–{fmt(p.range.high)}
                    {p.confidence === "rough" ? " · rough" : ""}
                  </span>
                </span>
              </summary>
              <div className="mt-2 border-t border-white/[0.08] pt-2">
                {p.splits && <Splits splits={p.splits} />}
                <ul className="mt-2 space-y-0.5 text-xs text-white/55">
                  {p.drivers.map((d, i) => (
                    <li key={i} className={d.kind === "missing" ? "text-amber-100/70" : ""}>
                      {d.kind === "missing" ? "Missing: " : "From: "}
                      {d.text}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <p className="mt-3 text-xs text-white/45">
          {missing.map((m) => m.label).join(", ")}: {[...new Set(missing.flatMap((m) => m.drivers.filter((d) => d.kind === "missing").map((d) => d.text)))].join(". ")}.
        </p>
      )}
    </div>
  );
}
