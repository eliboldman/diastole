"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";

import type { Tip } from "@/lib/discovery";
import { dismissTip } from "@/lib/discovery-actions";

/**
 * A one-time tip that sits right above the feature it's about, with a small pointer down to it.
 * Dismissed once, gone everywhere. Render it only when the feature is relevant.
 */
export default function Spotlight({ tip, seen }: { tip: Tip; seen: boolean }) {
  const [hidden, setHidden] = useState(seen);
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    void dismissTip(tip.id);
  };
  return (
    <div role="note" className="spotlight-in relative mt-4 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.08] p-3 pr-11 shadow-[0_0_30px_color-mix(in_oklab,var(--color-emerald-300)_12%,transparent)]">
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-50">
        <Sparkles size={14} className="shrink-0 text-emerald-200" aria-hidden /> {tip.title}
      </p>
      <p className="mt-0.5 text-sm text-white/65">{tip.body}</p>
      <button type="button" onClick={close} aria-label="Got it" className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white">
        <X size={15} />
      </button>
      <span aria-hidden className="absolute -bottom-[7px] left-8 h-3 w-3 rotate-45 border-b border-r border-emerald-300/30 bg-[color-mix(in_oklab,var(--color-emerald-300)_8%,var(--color-canvas))]" />
    </div>
  );
}
