"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Highlight } from "@/lib/discovery";
import { dismissTip } from "@/lib/discovery-actions";

/** "What's new" for the latest release: up to 3 highlights, dismissed once and gone. */
export default function WhatsNew({ id, items }: { id: string; items: Highlight[] }) {
  const [hidden, setHidden] = useState(false);
  if (hidden || !items.length) return null;
  return (
    <section className="spotlight-in relative mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-5 pr-12">
      <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-200/70">What&apos;s new</p>
      <ul className="mt-3 space-y-3">
        {items.slice(0, 3).map((h) => {
          const inner = (
            <>
              <span className="text-xl" aria-hidden>
                {h.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{h.title}</span>
                <span className="block text-sm text-white/55">{h.body}</span>
              </span>
            </>
          );
          return (
            <li key={h.title}>
              {h.href ? (
                <Link href={h.href} className="flex items-start gap-3 rounded-xl hover:bg-white/[0.03]">
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          void dismissTip(id);
        }}
        aria-label="Dismiss what's new"
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.06] hover:text-white"
      >
        <X size={16} />
      </button>
    </section>
  );
}
