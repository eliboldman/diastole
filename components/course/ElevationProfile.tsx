"use client";

import { useMemo, useRef, useState } from "react";

import type { Climb } from "@/lib/course/course";

import { dist, ele, type U } from "./units";

const W = 600;
const H = 160;
const PAD = { l: 34, r: 8, t: 10, b: 20 };

/** Elevation profile: area with climbs shaded, hover for distance, elevation and grade. */
export default function ElevationProfile({ profile, climbs, units }: { profile: [number, number][]; climbs: Climb[]; units: U }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { x, y, line, area, ticks, total, lo, hi } = useMemo(() => {
    const total = profile.at(-1)![0];
    const es = profile.map((p) => p[1]);
    const min = Math.min(...es);
    const max = Math.max(...es);
    const padE = Math.max(10, (max - min) * 0.15);
    const lo = min - padE;
    const hi = max + padE;
    const x = (d: number) => PAD.l + (d / total) * (W - PAD.l - PAD.r);
    const y = (e: number) => PAD.t + (1 - (e - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
    const line = profile.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const area = `${line}L${x(total).toFixed(1)},${H - PAD.b}L${PAD.l},${H - PAD.b}Z`;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total);
    return { x, y, line, area, ticks, total, lo, hi };
  }, [profile]);

  const at = hover === null ? null : profile[hover];
  const grade = hover !== null && hover > 0 ? ((profile[hover][1] - profile[hover - 1][1]) / Math.max(1, profile[hover][0] - profile[hover - 1][0])) * 100 : null;
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const d = (((clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r) * total;
    let best = 0;
    for (let i = 0; i < profile.length; i++) if (Math.abs(profile[i][0] - d) < Math.abs(profile[best][0] - d)) best = i;
    setHover(best);
  };

  return (
    <figure className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Elevation profile, ${dist(total, units)}, from ${ele(Math.min(...profile.map((p) => p[1])), units)} to ${ele(Math.max(...profile.map((p) => p[1])), units)}`}
        onPointerMove={(e) => move(e.clientX)}
        onPointerDown={(e) => move(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="currentColor" className="text-white/15" />
        {[lo + (hi - lo) * 0.2, lo + (hi - lo) * 0.8].map((e) => (
          <g key={e}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(e)} y2={y(e)} stroke="currentColor" strokeDasharray="2 4" className="text-white/10" />
            <text x={PAD.l - 4} y={y(e) + 3} textAnchor="end" className="fill-white/40 text-[9px]">
              {ele(e, units)}
            </text>
          </g>
        ))}
        {climbs.map((c) => (
          <rect key={c.start_m} x={x(c.start_m)} y={PAD.t} width={Math.max(1, x(c.end_m) - x(c.start_m))} height={H - PAD.t - PAD.b} className="fill-amber-200/[0.08]" />
        ))}
        <path d={area} className="fill-emerald-300/[0.12]" />
        <path d={line} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-emerald-300" />
        {ticks.map((d, i) => (
          <text key={i} x={x(d)} y={H - 6} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} className="fill-white/40 text-[9px]">
            {dist(d, units, d < 10000 ? 1 : 0)}
          </text>
        ))}
        {at && (
          <g>
            <line x1={x(at[0])} x2={x(at[0])} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" className="text-white/40" />
            <circle cx={x(at[0])} cy={y(at[1])} r={4} strokeWidth={2} className="fill-emerald-300 stroke-[#07110d]" />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 flex min-h-5 flex-wrap gap-x-3 text-xs tabular-nums text-white/55" aria-live="polite">
        {at ? (
          <>
            <span>{dist(at[0], units, 2)}</span>
            <span>{ele(at[1], units)}</span>
            {grade !== null && <span>{grade > 0 ? "+" : ""}{grade.toFixed(1)}%</span>}
          </>
        ) : (
          <span className="text-white/35">Touch or hover the profile for detail. Shaded: climbs.</span>
        )}
      </figcaption>
    </figure>
  );
}
