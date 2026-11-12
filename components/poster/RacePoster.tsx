"use client";

import { Share2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { haptic } from "@/lib/haptics";
import { setPosterKept } from "@/lib/poster/actions";
import { grayOf, type PosterState } from "@/lib/poster/poster";

type Sport = "run" | "bike" | "swim" | "tri" | "other";
// Palettes per sport, region by region (Diastole's own illustration).
const PALETTE: Record<Sport, string[]> = {
  run: ["#fda4af", "#fde68a", "#fff1f2", "#ffe4e6", "#9f1239", "#be123c", "#e11d48", "#44403c", "#166534", "#fbbf24", "#f43f5e", "#1c1917"],
  bike: ["#bae6fd", "#fef08a", "#f0f9ff", "#e0f2fe", "#1e3a8a", "#1d4ed8", "#2563eb", "#3f6212", "#14532d", "#f8fafc", "#0ea5e9", "#0c1a2e"],
  swim: ["#a5f3fc", "#fde68a", "#ecfeff", "#cffafe", "#155e75", "#0e7490", "#0891b2", "#0369a1", "#065f46", "#fbbf24", "#06b6d4", "#082f49"],
  tri: ["#fed7aa", "#fde047", "#fff7ed", "#ffedd5", "#7c2d12", "#0f766e", "#14b8a6", "#0e7490", "#166534", "#f8fafc", "#f97316", "#1c1917"],
  other: ["#c7d2fe", "#fde68a", "#eef2ff", "#e0e7ff", "#312e81", "#4338ca", "#6366f1", "#3f3f46", "#166534", "#fbbf24", "#8b5cf6", "#18181b"],
};

const REGION_NAMES = ["The sky", "The sun", "A cloud", "Another cloud", "The far peaks", "The left hills", "The right hills", "The course", "The trees", "The route", "The banner", "The title"];

export function PosterArt({ sport, name, date, line, state, onPick, picked, svgRef }: { sport: Sport; name: string; date: string; line: string; state: PosterState; onPick?: (i: number) => void; picked?: number | null; svgRef?: React.Ref<SVGSVGElement> }) {
  const pal = PALETTE[sport] ?? PALETTE.other;
  const c = (i: number) => (state.regions[i]?.colored ? pal[i] : grayOf(pal[i]));
  const hit = (i: number) => ({
    onClick: onPick ? () => onPick(i) : undefined,
    style: { cursor: onPick ? "pointer" : undefined, transition: "fill 900ms ease" },
    opacity: picked != null && picked !== i ? 0.75 : 1,
  });
  const foreground =
    sport === "swim" ? (
      <path d="M0 330c40-12 80 12 120 0s80-12 120 0 80 12 160 0v170H0z" fill={c(7)} {...hit(7)} />
    ) : sport === "tri" ? (
      <>
        <path d="M0 340c50-10 100 10 150 0s100-10 150 0 70 6 100 0v40H0z" fill={c(7)} {...hit(7)} />
      </>
    ) : (
      <path d="M0 360c80-30 160-20 240-40s110-10 160-10v190H0z" fill={c(7)} {...hit(7)} />
    );
  const route =
    sport === "swim" ? (
      <g {...hit(9)}>
        {[90, 200, 310].map((x, i) => (
          <circle key={i} cx={x} cy={360 + i * 6} r="9" fill={c(9)} stroke="#fff" strokeWidth="2" />
        ))}
      </g>
    ) : sport === "bike" ? (
      <path d="M60 470c80-30 40-60 120-80s20-50 100-70 60-20 80-30" stroke={c(9)} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray="14 10" {...hit(9)} />
    ) : (
      <path d="M150 500c10-40 60-70 90-110s50-50 80-70" stroke={c(9)} strokeWidth={sport === "tri" ? 8 : 12} fill="none" strokeLinecap="round" {...hit(9)} />
    );
  return (
    <svg ref={svgRef} viewBox="0 0 400 500" className="h-auto w-full rounded-[20px]" role="img" aria-label={`${name} poster, ${state.colored} of 12 parts in color`} xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="500" fill={c(0)} {...hit(0)} />
      <circle cx="292" cy="120" r="46" fill={c(1)} {...hit(1)} />
      <path d="M60 100a22 22 0 0 1 40-10 18 18 0 0 1 30 14 14 14 0 0 1-2 28H64a16 16 0 0 1-4-32z" fill={c(2)} {...hit(2)} />
      <path d="M210 60a16 16 0 0 1 30-6 13 13 0 0 1 22 10 10 10 0 0 1-2 20h-44a12 12 0 0 1-6-24z" fill={c(3)} {...hit(3)} />
      <path d="M0 260l60-70 50 40 70-90 60 70 50-50 110 110v40H0z" fill={c(4)} {...hit(4)} />
      <path d="M0 300c60-50 120-60 200-30v60H0z" fill={c(5)} {...hit(5)} />
      <path d="M160 300c70-50 160-60 240-20v60H160z" fill={c(6)} {...hit(6)} />
      {foreground}
      <g {...hit(8)}>
        {[30, 70, 340, 372].map((x, i) => (
          <path key={i} d={`M${x} ${312 + (i % 2) * 8}l16 -40 16 40z`} fill={c(8)} />
        ))}
      </g>
      {route}
      <path d="M40 395h320l-14 18 14 18H40l14-18z" fill={c(10)} {...hit(10)} />
      <text x="200" y="419" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="15" fontWeight="700" letterSpacing="3" fill="#fff" pointerEvents="none">
        {date.toUpperCase()}
      </text>
      <rect x="0" y="440" width="400" height="60" fill={c(11)} {...hit(11)} />
      <text x="200" y="470" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize={name.length > 26 ? 15 : 20} fontWeight="800" fill="#fff" pointerEvents="none">
        {name.length > 34 ? `${name.slice(0, 33)}…` : name}
      </text>
      <text x="200" y="489" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="10" letterSpacing="2" fill="#ffffff" opacity=".7" pointerEvents="none">
        {line.toUpperCase()}
      </text>
    </svg>
  );
}

type Bridge = { webkit?: { messageHandlers?: { diastole?: { postMessage: (m: unknown) => void } } } };

/** The poster card: tap a part to see which sessions colored it; share it as an image; keep finished ones. */
export default function RacePoster({ raceId, sport, name, date, line, state, own, kept, startsLabel }: { raceId: string; sport: Sport; name: string; date: string; line: string; state: PosterState; own: boolean; kept: boolean; startsLabel?: string | null }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [keep, setKeep] = useState(kept);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const svg = useRef<SVGSVGElement>(null);
  const region = picked != null ? state.regions[picked] : null;

  async function share() {
    const el = svg.current;
    if (!el) return;
    const xml = new XMLSerializer().serializeToString(el);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    canvas.getContext("2d")!.drawImage(img, 0, 0, 1080, 1350);
    const dataUrl = canvas.toDataURL("image/png");
    const native = (window as unknown as Bridge).webkit?.messageHandlers?.diastole;
    if (native) return native.postMessage({ type: "shareImage", data: dataUrl.split(",")[1] });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `${name.replace(/[^\w]+/g, "-").toLowerCase()}-poster.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => null);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = file.name;
    a.click();
  }

  return (
    <section className="row-in rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6" aria-label="Race poster">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Race poster</h2>
        <span className="text-sm tabular-nums text-white/55">{state.finished ? "Complete" : `${state.colored} of 12 in color`}</span>
      </div>
      <p className="mt-1 text-sm text-white/55">
        {state.finished ? "Fully colored. It's race time." : state.keys ? "Each key session you finish brings a part to life. Tap a part to see which sessions colored it." : startsLabel ? `Coloring starts ${startsLabel}, 16 weeks out: each key session from then brings a part to life.` : "Key sessions on your plan will color this in. It's fully colored on race day either way."}
      </p>
      <div className="mx-auto mt-4 max-w-sm">
        <PosterArt sport={sport} name={name} date={date} line={line} state={state} onPick={(i) => setPicked(picked === i ? null : i)} picked={picked} svgRef={svg} />
      </div>
      {region && (
        <div className="toast-in mt-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{REGION_NAMES[region.index]}</p>
            <button type="button" onClick={() => setPicked(null)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.06]">
              <X size={14} />
            </button>
          </div>
          {region.sessions.length ? (
            <ul className="mt-1 grid gap-1">
              {region.sessions.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 text-white/70">
                  <span className="min-w-0 truncate">{s.title}</span>
                  <span className={`shrink-0 text-xs ${s.status === "open" ? "text-white/45" : "text-emerald-200"}`}>
                    {new Date(`${s.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {s.status === "done" ? "done" : s.status === "excused" ? "life happened (counts)" : "to come"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-white/55">This part colors on race day.</p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void share()} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 px-4 text-sm text-white/85 hover:bg-white/[0.06]">
          <Share2 size={15} aria-hidden /> Share image
        </button>
        {own && state.finished && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-white/75">
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => {
                const next = e.target.checked;
                setKeep(next);
                start(async () => {
                  const r = await setPosterKept(raceId, next);
                  if (!r.ok) setKeep(!next);
                  else {
                    haptic("success");
                    setMsg(next ? "In your collection (Profile → Posters)." : null);
                  }
                });
              }}
              className="h-5 w-5 accent-[var(--color-emerald-300)]"
            />
            Keep in my poster collection
          </label>
        )}
      </div>
      {msg && <p role="status" className="mt-2 text-sm text-emerald-100/90">{msg}</p>}
    </section>
  );
}
