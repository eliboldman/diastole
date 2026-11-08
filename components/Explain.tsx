"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/** A small ⓘ next to a metric: tap for one plain sentence. */
export default function Explain({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle normal-case tracking-normal">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} aria-label={`What is ${label}?`} className="-m-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-white/35 hover:text-white/70">
        <Info size={13} aria-hidden />
      </button>
      {open && (
        <span id={id} role="tooltip" className="toast-in absolute left-1/2 top-full z-40 mt-1 w-64 -translate-x-1/2 rounded-2xl border border-white/10 bg-panel p-3 text-left text-[13px] font-normal leading-relaxed text-white/80 shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}
