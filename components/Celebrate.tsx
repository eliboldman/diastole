"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

export type Moment = { id: string; emoji: string; title: string; detail: string | null; href: string | null };

const KEY = "diastole:celebrated";
const seen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};

/** A real milestone (new PR, streak, threshold gain), celebrated once per device, then out of the way. */
export default function Celebrate({ moments }: { moments: Moment[] }) {
  const [show, setShow] = useState<Moment | null>(null);
  useEffect(() => {
    const done = seen();
    const next = moments.find((m) => !done.has(m.id));
    if (!next) return;
    const t = setTimeout(() => {
      setShow(next);
      navigator.vibrate?.([10, 40, 10, 40, 20]);
    }, 400);
    return () => clearTimeout(t);
  }, [moments]);
  if (!show) return null;
  const close = () => {
    try {
      const s = seen();
      for (const m of moments) s.add(m.id); // one celebration per visit is plenty
      localStorage.setItem(KEY, JSON.stringify([...s].slice(-200)));
    } catch {}
    setShow(null);
  };
  return (
    <section className="success-pop relative mt-6 overflow-hidden rounded-[28px] border border-amber-200/30 bg-gradient-to-br from-amber-200/[0.12] to-emerald-300/[0.06] p-5" role="status">
      <span className="pointer-events-none absolute inset-0" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="prop-burst absolute left-1/2 top-1/2 text-lg"
            style={{ "--dx": `${Math.round(Math.cos(i * 0.9) * (70 + (i % 5) * 22))}px`, "--dy": `${Math.round(-30 - ((i * 37) % 90))}px`, "--r": `${i * 40}deg`, animationDelay: `${(i % 6) * 40}ms` } as CSSProperties}
          >
            {i % 3 === 0 ? show.emoji : i % 3 === 1 ? "✨" : "🎉"}
          </span>
        ))}
      </span>
      <div className="relative flex items-center gap-4">
        <span className="text-4xl" aria-hidden>
          {show.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.15em] text-amber-100/80">Milestone</p>
          <p className="text-xl font-semibold">{show.title}</p>
          {show.detail && <p className="text-sm tabular-nums text-white/70">{show.detail}</p>}
          {show.href && (
            <Link href={show.href} onClick={close} className="mt-2 inline-flex min-h-10 items-center text-sm text-amber-100 hover:underline">
              See the workout →
            </Link>
          )}
        </div>
        <button type="button" onClick={close} aria-label="Dismiss" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.08]">
          <X size={18} />
        </button>
      </div>
    </section>
  );
}
