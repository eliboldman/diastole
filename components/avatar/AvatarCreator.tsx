"use client";

import { Dices, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Avatar, { type AvatarState } from "@/components/avatar/Avatar";
import { saveLook } from "@/lib/avatar/actions";
import { BUILD, DEFAULT_LOOK, HEIGHT, normalizeLook, type Look } from "@/lib/avatar/look";

/**
 * The mannequin creator: a live 3D preview you can turn, and two self-chosen sliders.
 * Proportions are never suggested, scored or linked to any data. Changes save themselves.
 */
export default function AvatarCreator({ initial, state }: { initial: unknown; state: AvatarState }) {
  const [look, setLook] = useState<Look>(() => normalizeLook(initial));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const r = await saveLook(look);
      setStatus(r.ok ? "saved" : "error");
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [look]);

  const set = (patch: Partial<Look>) => setLook((l) => normalizeLook({ ...l, ...patch }));

  const slider = (key: keyof Look, range: { min: number; max: number }, low: string, high: string, label: string) => (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-white/50">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={0.01}
        value={look[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
        onPointerUp={() => navigator.vibrate?.(5)}
        className="h-11 w-full accent-emerald-300"
        aria-label={label}
      />
      <span className="flex justify-between text-xs text-white/45">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );

  return (
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[1fr_18rem] md:items-center">
      <div className="flex justify-center rounded-[32px] border border-white/10 bg-gradient-to-b from-emerald-300/[0.06] to-transparent p-2 backdrop-blur-xl">
        <Avatar look={look} {...state} className="h-[26rem] w-64 sm:h-[30rem] sm:w-72" title="Your avatar" />
      </div>
      <div className="space-y-6">
        {slider("height", HEIGHT, "Shorter", "Taller", "Height")}
        {slider("build", BUILD, "Narrower", "Broader", "Build")}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set({ height: HEIGHT.min + Math.random() * (HEIGHT.max - HEIGHT.min), build: BUILD.min + Math.random() * (BUILD.max - BUILD.min) })}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] text-sm transition active:scale-95 hover:bg-white/[0.1]"
          >
            <Dices size={16} /> Randomize
          </button>
          <button
            type="button"
            onClick={() => set(DEFAULT_LOOK)}
            aria-label="Reset to the middle"
            className="flex min-h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] transition active:scale-95 hover:bg-white/[0.1]"
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <p className="text-xs text-white/45" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Check your connection." : "Drag the figure to turn it. Changes save automatically."}
        </p>
        <p className="text-xs leading-relaxed text-white/40">
          Your avatar glows where you trained when you need recovery, and its aura grows with real milestones: PRs, consistent weeks, FTP and threshold gains.
        </p>
      </div>
    </div>
  );
}
