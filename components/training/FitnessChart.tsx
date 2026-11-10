"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { LoadView } from "@/lib/training/load-data";

// Validated (dark surface #1a2421): both in the L 0.48–0.67 band, deutan ΔE 22, normal ΔE 27.
const FIT = "#13a979";
const FAT = "#7076f0";

const H = 170;
const FH = 90; // form strip
const PAD_T = 10;
const PAD_B = 6;
const LABEL_W = 92; // room for the direct labels at the right

const day = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// Form bands, drawn as faint neutral shading with words (not status colors).
const BANDS = [
  { lo: 5, hi: 60, label: "Fresh" },
  { lo: -10, hi: 5, label: "Neutral" },
  { lo: -30, hi: -10, label: "Building" },
  { lo: -80, hi: -30, label: "Very fatigued" },
];

export default function FitnessChart({ view }: { view: LoadView }) {
  const { days, now, today } = view;
  const n = days.length;
  const iToday = Math.max(0, days.findIndex((d) => d.date === today));
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Drawn at the real pixel width so text stays its true size on any screen.
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const x = useCallback((i: number) => (i / Math.max(1, n - 1)) * (W - LABEL_W), [n, W]);
  // Fit the scale to the data (not from zero) so changes are visible; never below 0.
  const [lo, top] = useMemo(() => {
    const vals = days.flatMap((d) => [d.fitness, d.fatigue]);
    const mx = Math.max(20, ...vals);
    const mn = Math.min(...vals);
    return [Math.max(0, mn - (mx - mn) * 0.15), mx + (mx - mn) * 0.08];
  }, [days]);
  const y = (v: number) => PAD_T + (1 - (v - lo) / Math.max(1, top - lo)) * (H - PAD_T - PAD_B);
  const fMin = Math.min(-35, ...days.map((d) => d.form)) - 3;
  const fMax = Math.max(15, ...days.map((d) => d.form)) + 3;
  const fy = (v: number) => 4 + (1 - (v - fMin) / (fMax - fMin)) * (FH - 8);

  const path = (vals: number[], from: number, to: number, yy: (v: number) => number) =>
    vals
      .slice(from, to + 1)
      .map((v, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)},${yy(v).toFixed(1)}`)
      .join("");
  const fit = days.map((d) => d.fitness);
  const fat = days.map((d) => d.fatigue);
  const form = days.map((d) => d.form);
  const hasFuture = iToday < n - 1;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.min(n - 1, Math.max(0, Math.round((px / (W - LABEL_W)) * (n - 1)))));
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.min(n - 1, Math.max(0, (h ?? iToday) + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  const h = hover !== null ? days[hover] : null;
  const ticks = days.map((d, i) => ({ d, i })).filter(({ d }) => d.date.endsWith("-01"));

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2">
        <Tile label="Fitness" value={String(Math.round(now.fitness))} sub={now.ramp !== null ? `${signed(now.ramp)} this week` : null} swatch={FIT} />
        <Tile label="Fatigue" value={String(Math.round(now.fatigue))} swatch={FAT} />
        <Tile label="Form" value={signed(now.form)} sub={now.band.label} />
      </dl>
      <p className="mt-2 text-sm text-white/70">
        {now.band.note}
        {now.ramp !== null && now.ramp > 8 ? " Fitness is climbing fast (over 8 a week), so watch for fatigue piling up." : ""}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/60" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: FIT }} /> Fitness (42-day)</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: FAT }} /> Fatigue (7-day)</span>
        {hasFuture && <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-white/50" /> From planned workouts</span>}
      </div>

      <div ref={boxRef} className="relative mt-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H + 14 + FH + 16}`}
          className="block w-full touch-pan-y outline-none"
          role="img"
          aria-label={`Fitness ${Math.round(now.fitness)}, fatigue ${Math.round(now.fatigue)}, form ${signed(now.form)} (${now.band.label}). Use arrow keys to read each day.`}
          tabIndex={0}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
          onKeyDown={key}
          onBlur={() => setHover(null)}
        >
          {/* Recessive grid: month starts */}
          {ticks.map(({ d, i }) => (
            <g key={d.date}>
              <line x1={x(i)} x2={x(i)} y1={PAD_T} y2={H + 14 + FH} stroke="rgba(255,255,255,0.06)" />
              <text x={x(i) + 4} y={H + 14 + FH + 13} fontSize="11" fill="rgba(255,255,255,0.45)">{day(d.date, { month: "short" })}</text>
            </g>
          ))}
          {/* Today */}
          <line x1={x(iToday)} x2={x(iToday)} y1={PAD_T} y2={H + 14 + FH} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 3" />

          {/* Fitness and fatigue: solid through today, dashed after */}
          {[{ v: fat, c: FAT }, { v: fit, c: FIT }].map(({ v, c }) => (
            <g key={c} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={path(v, 0, iToday, y)} stroke={c} />
              {hasFuture && <path d={path(v, iToday, n - 1, y)} stroke={c} strokeDasharray="5 5" opacity="0.7" />}
            </g>
          ))}
          {/* Direct labels at today's value (text in ink, not series color) */}
          {(() => {
            const a = y(fit[n - 1]);
            const b = y(fat[n - 1]);
            const gap = 13;
            const [la, lb] = Math.abs(a - b) < gap ? (a < b ? [a - gap / 2, b + gap / 2] : [a + gap / 2, b - gap / 2]) : [a, b];
            const lx = x(n - 1) + 8;
            return (
              <g fontSize="12" fill="rgba(255,255,255,0.8)">
                <text x={lx} y={la + 4}>Fitness</text>
                <text x={lx} y={lb + 4}>Fatigue</text>
              </g>
            );
          })()}

          {/* Form strip */}
          <g transform={`translate(0 ${H + 14})`}>
            {BANDS.map((b, k) => {
              const y1 = fy(Math.min(b.hi, fMax));
              const y2 = fy(Math.max(b.lo, fMin));
              if (y2 <= y1) return null;
              return (
                <g key={b.label}>
                  <rect x={0} y={y1} width={W - LABEL_W} height={y2 - y1} fill={k % 2 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.055)"} />
                  <text x={W - LABEL_W + 8} y={(y1 + y2) / 2 + 4} fontSize="11" fill="rgba(255,255,255,0.45)">{b.label}</text>
                </g>
              );
            })}
            <line x1={0} x2={W - LABEL_W} y1={fy(0)} y2={fy(0)} stroke="rgba(255,255,255,0.25)" />
            <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={path(form, 0, iToday, fy)} />
              {hasFuture && <path d={path(form, iToday, n - 1, fy)} strokeDasharray="5 5" opacity="0.6" />}
            </g>
            <text x={4} y={12} fontSize="11" fill="rgba(255,255,255,0.55)">Form</text>
          </g>

          {/* Crosshair */}
          {h && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H + 14 + FH} stroke="rgba(255,255,255,0.45)" />
              <circle cx={x(hover)} cy={y(h.fitness)} r="5" fill={FIT} stroke="#1a2421" strokeWidth="2" />
              <circle cx={x(hover)} cy={y(h.fatigue)} r="5" fill={FAT} stroke="#1a2421" strokeWidth="2" />
              <circle cx={x(hover)} cy={H + 14 + fy(h.form)} r="5" fill="#e5e7eb" stroke="#1a2421" strokeWidth="2" />
            </g>
          )}
        </svg>

        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl border border-white/10 bg-panel/95 p-2.5 text-xs shadow-xl backdrop-blur"
            style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 5.5rem), calc(100% - 11rem))` }}
          >
            <p className="font-medium text-white">
              {day(h.date, { weekday: "short", month: "short", day: "numeric" })}
              {h.planned && <span className="text-white/50"> · planned</span>}
            </p>
            <Row c={FIT} k="Fitness" v={Math.round(h.fitness)} />
            <Row c={FAT} k="Fatigue" v={Math.round(h.fatigue)} />
            <Row k="Form" v={signed(Math.round(h.form))} />
            <Row k={h.planned ? "Planned load" : "Load"} v={h.load} />
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-white/60">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-1 w-full text-left text-xs tabular-nums">
            <thead className="text-white/45">
              <tr><th className="py-1 pr-3 font-normal">Day</th><th className="pr-3 font-normal">Load</th><th className="pr-3 font-normal">Fitness</th><th className="pr-3 font-normal">Fatigue</th><th className="font-normal">Form</th></tr>
            </thead>
            <tbody className="text-white/75">
              {days.slice(Math.max(0, iToday - 13)).map((d) => (
                <tr key={d.date} className={`border-t border-white/[0.06] ${d.date === today ? "text-white" : ""}`}>
                  <td className="py-1 pr-3">{day(d.date, { weekday: "short", month: "short", day: "numeric" })}{d.planned ? " (plan)" : d.date === today ? " (today)" : ""}</td>
                  <td className="pr-3">{d.load || "–"}</td>
                  <td className="pr-3">{Math.round(d.fitness)}</td>
                  <td className="pr-3">{Math.round(d.fatigue)}</td>
                  <td>{signed(Math.round(d.form))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Tile({ label, value, sub, swatch }: { label: string; value: string; sub?: string | null; swatch?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/45">
        {swatch && <span className="h-2 w-2 rounded-full" style={{ background: swatch }} aria-hidden />}
        {label}
      </dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="truncate text-xs text-white/55">{sub}</dd>}
    </div>
  );
}

function Row({ k, v, c }: { k: string; v: string | number; c?: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-white/75">
      {c && <span className="h-2 w-2 rounded-full" style={{ background: c }} aria-hidden />}
      <span className="flex-1">{k}</span>
      <span className="tabular-nums text-white">{v}</span>
    </p>
  );
}
