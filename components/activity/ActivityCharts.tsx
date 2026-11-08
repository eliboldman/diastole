"use client";

import Explain from "@/components/Explain";
import { explain, type ExplainKey } from "@/lib/explain";

// "Explain this" for running-form charts, with this run's average.
const CHART_KEYS: Record<string, ExplainKey> = { vo: "vertical_oscillation", gct: "ground_contact", vr: "vertical_ratio", stride: "stride_length" };
const mean = (v: (number | null)[]) => {
  const xs = v.filter((x): x is number => x !== null && Number.isFinite(x) && x > 0);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
};

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { Streams } from "@/lib/activity/fit";
import { isFootSport, MILE, paceOf, type Units } from "@/lib/activity/format";
import { swimClock, unitLabel } from "@/lib/activity/swim";
import type { PoolUnit } from "@/lib/workouts/garmin-format";

type ChartSeries = {
  key: string;
  title: string;
  unit: string;
  values: (number | null)[];
  format: (v: number) => string;
  invert?: boolean; // pace: faster (smaller) is up
  area?: boolean; // elevation reads better filled
};

const W = 1000;
const H = 120;
const PAD = 6;

/** Domain from the 2nd–98th percentile so a single GPS spike doesn't flatten the chart. */
function domain(values: (number | null)[]): [number, number] | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length < 2) return null;
  let lo = v[Math.floor(v.length * 0.02)];
  let hi = v[Math.ceil(v.length * 0.98) - 1];
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

function clockLabel(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

const int = (v: number) => String(Math.round(v));

/** Running-dynamics charts for the Form section. */
function formSeries(streams: Streams): ChartSeries[] {
  const out: ChartSeries[] = [];
  if (streams.gct) out.push({ key: "gct", title: "Ground contact", unit: "ms", values: streams.gct, format: int });
  if (streams.vo) out.push({ key: "vo", title: "Vertical oscillation", unit: "cm", values: streams.vo.map((v) => (v === null ? null : v / 10)), format: (v) => v.toFixed(1) });
  if (streams.vr) out.push({ key: "vr", title: "Vertical ratio", unit: "%", values: streams.vr, format: (v) => v.toFixed(1) });
  if (streams.stride) out.push({ key: "stride", title: "Stride length", unit: "m", values: streams.stride, format: (v) => v.toFixed(2) });
  if (streams.gct_bal) out.push({ key: "gct_bal", title: "GCT balance", unit: "% left", values: streams.gct_bal, format: (v) => v.toFixed(1) });
  return out;
}

/** The charts to draw, in reading order, from whatever streams this activity has. */
function seriesFor(streams: Streams, sport: string | null, u: Units, swimUnit: PoolUnit | null): ChartSeries[] {
  const per = u === "mi" ? MILE : 1000;
  const foot = isFootSport(sport);
  const out: ChartSeries[] = [];
  if (streams.hr) out.push({ key: "hr", title: "Heart rate", unit: "bpm", values: streams.hr, format: int });
  if (streams.speed) {
    const per100 = swimUnit === "YARD" ? 91.44 : 100;
    out.push(
      swimUnit
        ? {
            key: "pace",
            title: "Pace",
            unit: `/100${unitLabel(swimUnit)}`,
            // seconds per 100; resting at the wall is a gap
            values: streams.speed.map((v) => (v !== null && v >= 0.2 ? per100 / v : null)),
            format: (v) => swimClock(v),
            invert: true,
          }
        : foot
        ? {
            key: "pace",
            title: "Pace",
            unit: `/${u}`,
            // seconds per mile or km; standing still is a gap, not an off-the-chart value
            values: streams.speed.map((v) => (v !== null && v >= 0.5 ? per / v : null)),
            format: (v) => paceOf(per / v, u) ?? "–",
            invert: true,
          }
        : {
            key: "speed",
            title: "Speed",
            unit: u === "mi" ? "mph" : "km/h",
            values: streams.speed.map((v) => (v === null ? null : v * (u === "mi" ? 2.236936 : 3.6))),
            format: (v) => v.toFixed(1),
          },
    );
  }
  if (streams.power) out.push({ key: "power", title: "Power", unit: "W", values: streams.power, format: int });
  if (streams.cadence)
    out.push({ key: "cadence", title: swimUnit ? "Stroke rate" : "Cadence", unit: swimUnit ? "str/min" : foot ? "spm" : "rpm", values: streams.cadence, format: int });
  if (streams.alt) out.push({ key: "alt", title: "Elevation", unit: "m", values: streams.alt, format: int, area: true });
  return out;
}

export default function ActivityCharts({
  streams,
  sport,
  set = "session",
  units = "mi",
  swimUnit = null,
}: {
  streams: Streams;
  sport: string | null;
  set?: "session" | "form";
  units?: Units;
  swimUnit?: PoolUnit | null;
}) {
  const t = streams.t;
  const series = useMemo(() => (set === "form" ? formSeries(streams) : seriesFor(streams, sport, units, swimUnit)), [streams, sport, set, units, swimUnit]);
  const [idx, setIdx] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const end = t[t.length - 1] || 1;

  const prepared = useMemo(
    () =>
      series
        .map((s) => {
          const d = domain(s.values);
          if (!d) return null;
          const [lo, hi] = d;
          const y = (v: number) => {
            const c = Math.min(hi, Math.max(lo, v));
            const f = (c - lo) / (hi - lo);
            return PAD + (s.invert ? f : 1 - f) * (H - 2 * PAD);
          };
          let path = "";
          let pen = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            const x = (t[i] / end) * W;
            path += `${pen ? "L" : "M"}${x.toFixed(1)} ${y(v).toFixed(1)}`;
            pen = true;
          });
          const area = s.area ? `${path}L${W} ${H}L0 ${H}Z` : null;
          const real = s.values.filter((v): v is number => v !== null);
          return { ...s, path, area, y, top: s.invert ? Math.min(...real) : Math.max(...real), bottom: s.invert ? Math.max(...real) : Math.min(...real) };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null),
    [series, t, end],
  );

  const pick = useCallback(
    (clientX: number) => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box || !t.length) return;
      const sec = Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * end;
      // nearest sample
      let lo = 0;
      let hi = t.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid] < sec) lo = mid;
        else hi = mid;
      }
      setIdx(sec - t[lo] < t[hi] - sec ? lo : hi);
    },
    [t, end],
  );

  const onPointer = (e: PointerEvent<HTMLDivElement>) => pick(e.clientX);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.shiftKey ? 12 : 1;
    setIdx((i) => Math.min(t.length - 1, Math.max(0, (i ?? 0) + (e.key === "ArrowRight" ? step : -step))));
  };

  if (!prepared.length) return null;
  const xPct = idx === null ? null : (t[idx] / end) * 100;

  return (
    <div>
      {/* One readout for every chart at the crosshair */}
      <div className="sticky top-2 z-10 mb-3 flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-panel/85 px-4 py-2 text-sm backdrop-blur-xl" aria-live="polite">
        {idx === null ? (
          <span className="text-white/50">Drag across the charts to read values</span>
        ) : (
          <>
            <span className="tabular-nums text-white/50">{clockLabel(t[idx])}</span>
            {prepared.map((s) => {
              const v = s.values[idx];
              return (
                <span key={s.key} className="whitespace-nowrap">
                  <strong className="font-semibold tabular-nums text-white">{v === null ? "–" : s.format(v)}</strong>{" "}
                  <span className="text-white/50">{s.title.toLowerCase()}</span>
                </span>
              );
            })}
          </>
        )}
      </div>

      <div
        ref={wrap}
        role="slider"
        tabIndex={0}
        aria-label="Time through the workout. Use left and right arrows to move."
        aria-valuemin={0}
        aria-valuemax={Math.round(end)}
        aria-valuenow={idx === null ? 0 : Math.round(t[idx])}
        aria-valuetext={idx === null ? "Start" : clockLabel(t[idx])}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={(e) => e.pointerType === "mouse" && setIdx(null)}
        onKeyDown={onKey}
        className="relative cursor-crosshair touch-pan-y select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/60"
      >
        {prepared.map((s) => (
          <div key={s.key} className="mb-4">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-white/80">
                {s.title}
                {CHART_KEYS[s.key] && <Explain label={s.title} text={explain(CHART_KEYS[s.key], { value: mean(s.values) })} />}
              </h3>
              <span className="truncate text-xs tabular-nums text-white/45">
                {s.format(s.bottom)} – {s.format(s.top)} {s.unit}
              </span>
            </div>
            <div className="relative">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full sm:h-28" aria-hidden>
                <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,0.07)" vectorEffect="non-scaling-stroke" />
                {s.area && <path d={s.area} fill="rgba(110,231,183,0.12)" />}
                <path d={s.path} fill="none" stroke="#6ee7b7" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {/* HTML dot: an SVG circle would stretch into an ellipse with this aspect ratio */}
              {idx !== null && s.values[idx] !== null && (
                <span
                  className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-emerald-300"
                  style={{ left: `${(t[idx] / end) * 100}%`, top: `${(s.y(s.values[idx]!) / H) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
        {xPct !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-white/40" style={{ left: `${xPct}%` }} />}
        <div className="flex justify-between text-xs tabular-nums text-white/40">
          <span>0:00</span>
          <span>{clockLabel(end / 2)}</span>
          <span>{clockLabel(end)}</span>
        </div>
      </div>
    </div>
  );
}
