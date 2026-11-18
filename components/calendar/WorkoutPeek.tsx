"use client";

import { ChevronRight, Clock, Flame, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export type Peek = {
  id: string;
  href: string;
  title: string;
  who?: string; // athlete first name, on a coach's all-athletes view
  badge: { label: string; done: boolean };
  sport: string;
  time: string | null; // "6:30 am"
  minutes: number | null;
  hardMinutes: number;
  description: string | null;
  lines: string[];
  more: number; // steps left out of the bubble
  sealed: boolean;
};

/** A row in the calendar's day list. Tapping it opens a small bubble with what the workout is, so you can prepare without leaving the calendar. */
export default function WorkoutPeek({ w }: { w: Peek }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLLIElement>(null);
  const panel = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const facts = [
    w.time && { icon: Clock, text: w.time },
    w.minutes && { icon: Clock, text: `About ${w.minutes} min` },
    !w.sealed && w.hardMinutes >= 8 && { icon: Flame, text: `${w.hardMinutes} min hard` },
  ].filter(Boolean) as { icon: typeof Clock; text: string }[];

  return (
    <li ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panel}
        className="lift flex w-full items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left"
      >
        <span className="min-w-0">
          <span className="block font-medium">
            {w.who && <span className="text-white/55">{w.who} · </span>}
            {w.title}
          </span>
          <span className="mt-0.5 block text-sm text-white/55">
            {[w.sport, w.minutes && `${w.minutes} min`, w.time].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider ${
            w.badge.done ? "border-white/10 bg-white/[0.08] text-white/70" : "border-emerald-300/25 text-emerald-100"
          }`}
        >
          {w.badge.label}
        </span>
      </button>

      {open && (
        <div
          id={panel}
          role="region"
          aria-label={`${w.title} preview`}
          className="row-in relative mt-2 rounded-2xl border border-emerald-300/20 bg-[#0c1512]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <span aria-hidden className="absolute -top-1.5 left-8 h-3 w-3 rotate-45 border-l border-t border-emerald-300/20 bg-[#0c1512]" />

          {facts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {facts.map((f) => (
                <span key={f.text} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-xs text-white/80">
                  <f.icon size={12} aria-hidden /> {f.text}
                </span>
              ))}
            </div>
          )}

          {w.sealed ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-white/65">
              <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
              Mystery workout. The steps stay hidden until you reveal them on the workout page.
            </p>
          ) : (
            <>
              {w.description && <p className="mt-3 text-sm text-white/75">{w.description}</p>}
              {w.lines.length > 0 && (
                <ol className="mt-3 grid gap-1 text-sm text-white/70">
                  {w.lines.map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-4 shrink-0 text-right tabular-nums text-white/35">{i + 1}</span>
                      <span className="min-w-0">{l}</span>
                    </li>
                  ))}
                  {w.more > 0 && <li className="pl-6 text-white/45">{`+ ${w.more} more`}</li>}
                </ol>
              )}
              {!w.description && !w.lines.length && <p className="mt-3 text-sm text-white/55">No details on this one yet.</p>}
            </>
          )}

          <Link href={w.href} className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm text-emerald-200 hover:text-emerald-100">
            Full workout <ChevronRight size={14} aria-hidden />
          </Link>
        </div>
      )}
    </li>
  );
}
