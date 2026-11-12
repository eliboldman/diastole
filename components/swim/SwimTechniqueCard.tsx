import { Waves } from "lucide-react";

import type { SwimView } from "@/lib/swim/data";
import type { SwimVideo } from "@/lib/swim/video";
import { DRILLS, type Trend } from "@/lib/swim/insights";

import { DrillButtons, SwimNoteForm } from "./SwimCoachControls";
import SwimVideos from "./SwimVideos";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function Delta({ t, better, fmt }: { t: Trend | null; better: "up" | "down"; fmt: (v: number) => string }) {
  if (!t || Math.abs(t.pct) < 2) return t ? <span className="text-[11px] text-white/40">steady</span> : null;
  const good = better === "up" ? t.pct > 0 : t.pct < 0;
  return <span className={`text-[11px] ${good ? "text-emerald-200" : "text-amber-200/80"}`}>{good ? "better" : "worse"}: {fmt(t.from)} → {fmt(t.to)}</span>;
}

function Spark({ values, label, unit }: { values: number[]; label: string; unit: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 4 + (i / (values.length - 1)) * 192;
  const y = (v: number) => 4 + (1 - (v - min) / span) * 32;
  return (
    <svg viewBox="0 0 200 40" className="mt-2 h-10 w-full" role="img" aria-label={label}>
      <path d={values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-emerald-300" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === values.length - 1 ? 3.5 : 2.5} className="fill-emerald-300">
          <title>{v.toFixed(2)} {unit} per stroke</title>
        </circle>
      ))}
    </svg>
  );
}

/** Freestyle efficiency over the last 12 weeks, the coach's drill focus, and (coach) drill suggestions to approve. */
export default function SwimTechniqueCard({ view, coach, athleteId, videos }: { view: SwimView; coach?: boolean; athleteId?: string; videos?: SwimVideo[] }) {
  const last = view.metrics.at(-1);
  const recent = view.metrics.slice(-5);
  const avg = (k: "dps" | "spl25" | "swolf25") => (recent.length ? recent.reduce((a, m) => a + m[k], 0) / recent.length : 0);
  const rated = recent.filter((m) => m.rate);
  // Stored per metre / per 25 m; mile users read per yard / per 25 yd.
  const yd = view.yards;
  const len = yd ? "25 yd" : "25 m";
  const dist = (v: number) => (yd ? v / 0.9144 : v);
  const per25 = (v: number) => (yd ? v * 0.9144 : v);
  return (
    <section id="swim" className="scroll-mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <Waves size={18} className="text-emerald-200" aria-hidden /> Swim technique
      </h2>
      {last ? (
        <>
          <p className="mt-1 text-xs text-white/45">Freestyle, {recent.length === 1 ? "your last pool swim" : `last ${recent.length} pool swims`} (per {len} so pools compare).</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Distance / stroke", value: `${dist(avg("dps")).toFixed(2)} ${yd ? "yd" : "m"}`, delta: <Delta t={view.trends.dps} better="up" fmt={(v) => dist(v).toFixed(2)} /> },
              { label: `Strokes / ${len}`, value: per25(avg("spl25")).toFixed(1), delta: null },
              { label: `SWOLF (${len})`, value: String(Math.round(per25(avg("swolf25")))), delta: <Delta t={view.trends.swolf25} better="down" fmt={(v) => String(Math.round(per25(v)))} /> },
              { label: "Stroke rate", value: rated.length ? `${Math.round(rated.reduce((a, m) => a + m.rate!, 0) / rated.length)}/min` : "–", delta: null },
            ].map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <p className="text-[11px] text-white/45">{tile.label}</p>
                <p className="text-lg font-semibold tabular-nums">{tile.value}</p>
                {tile.delta}
              </div>
            ))}
          </div>
          <Spark unit={yd ? "yd" : "m"} values={view.metrics.map((m) => dist(m.dps))} label={`Distance per stroke across ${view.metrics.length} swims`} />
          {view.trends.pace100 && Math.abs(view.trends.pace100.pct) >= 2 && (
            <p className="mt-1 text-xs text-white/55">
              Freestyle pace: {mmss(per25(view.trends.pace100.from))} → {mmss(per25(view.trends.pace100.to))} per {yd ? "100 yd" : "100 m"} over these swims.
            </p>
          )}
          {view.lastFade && <p className={`mt-2 text-sm ${view.lastFade.flagged ? "text-amber-100/90" : "text-white/60"}`}>Last swim: {view.lastFade.text}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-white/55">Pool swims with stroke counts show up here.</p>
      )}

      {view.focus.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium">{coach ? "Approved drills" : "Drills from your coach"}</h3>
          {view.note && !coach && <p className="mt-1 text-sm text-emerald-50/85">{view.note}</p>}
          <ul className="mt-2 grid gap-2">
            {view.focus.map((d) => (
              <li key={d.key} className="flex items-start gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-white/60">{d.set}</span>
                </span>
                {coach && athleteId && <DrillButtons athleteId={athleteId} drill={d.key} mode="focus" />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {athleteId && <SwimVideos athleteId={athleteId} videos={videos ?? []} coach={coach} asked={view.videoAsked} />}

      {coach && athleteId && (
        <>
          {view.suggestions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-medium">Suggested drills</h3>
              <p className="text-xs text-white/45">From the numbers above. Nothing reaches the athlete until you approve it.</p>
              <ul className="mt-2 grid gap-2">
                {view.suggestions.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="min-w-0 flex-1 basis-48">
                      <span className="block text-sm font-medium">{DRILLS[s.key].name}</span>
                      <span className="block text-xs text-white/60">{DRILLS[s.key].set}</span>
                      <span className="mt-1 block text-xs text-amber-100/70">Why: {s.why}</span>
                    </span>
                    <DrillButtons athleteId={athleteId} drill={s.key} mode="suggested" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SwimNoteForm athleteId={athleteId} note={view.note ?? ""} videoAsked={view.videoAsked} />
        </>
      )}
      <p className="mt-4 text-xs text-white/40">Training guidance from watch stroke data, which can miscount on turns and drills.</p>
    </section>
  );
}
