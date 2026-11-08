"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export type MetricCard = {
  key: string;
  label: string;
  value: string; // display value, already formatted
  sub?: string | null; // e.g. "+12 W since Sep"
  updated: string | null; // "Nov 3" / "today"
  points: { t: string; v: number }[]; // oldest first, for the sparkline
  invert?: boolean; // lower is better (pace): draw "up" as faster
  history: { date: string; text: string }[]; // newest first, shown when opened
  good?: boolean | null; // trend direction for the tint: true = improving
};

function Spark({ points, invert, big = false }: { points: MetricCard["points"]; invert?: boolean; big?: boolean }) {
  if (points.length < 2) return null;
  const W = big ? 320 : 96;
  const H = big ? 80 : 28;
  const xs = points.map((p) => Date.parse(p.t));
  const vs = points.map((p) => p.v);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
  const x = (t: number) => 3 + ((t - x0) / (x1 - x0 || 1)) * (W - 6);
  const y = (v: number) => {
    const f = hi === lo ? 0.5 : (v - lo) / (hi - lo);
    return 3 + (invert ? f : 1 - f) * (H - 6);
  };
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(xs[i]).toFixed(1)} ${y(p.v).toFixed(1)}`).join("");
  const last = points.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={big ? "h-20 w-full" : "h-7 w-24"} preserveAspectRatio="none" aria-hidden>
      {big && <path d={`${d}L${x(xs.at(-1)!)} ${H}L${x(xs[0])} ${H}Z`} fill="color-mix(in oklab, var(--color-emerald-300) 10%, transparent)" />}
      <path d={d} fill="none" stroke="var(--color-emerald-300)" strokeWidth={big ? 2 : 1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(Date.parse(last.t))} cy={y(last.v)} r={big ? 3.5 : 2.4} fill="var(--color-emerald-300)" />
    </svg>
  );
}

function Card({ m }: { m: MetricCard }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-[24px] border border-white/10 bg-white/[0.05] backdrop-blur-xl transition ${open ? "sm:col-span-2" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 rounded-[24px] p-4 text-left transition active:scale-[0.99] hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] uppercase tracking-[0.15em] text-white/50">{m.label}</span>
          <span className="mt-1 block truncate text-2xl font-semibold tabular-nums">{m.value}</span>
          {m.sub && <span className={`block truncate text-xs ${m.good === true ? "text-emerald-200" : m.good === false ? "text-amber-200" : "text-white/50"}`}>{m.sub}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <Spark points={m.points} invert={m.invert} />
          <span className="flex items-center gap-1 text-[11px] text-white/40">
            {m.updated ? `Updated ${m.updated}` : ""}
            {m.history.length > 0 && <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />}
          </span>
        </span>
      </button>
      {open && m.history.length > 0 && (
        <div className="row-in border-t border-white/[0.08] px-4 pb-4 pt-3">
          <Spark points={m.points} invert={m.invert} big />
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
            {m.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-3 tabular-nums">
                <span className="text-white/55">{h.date}</span>
                <span className="text-white/85">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function MetricCards({ cards }: { cards: MetricCard[] }) {
  if (!cards.length) return null;
  return (
    <div className="stagger grid gap-3 sm:grid-cols-2">
      {cards.map((m) => (
        <Card key={m.key} m={m} />
      ))}
    </div>
  );
}
