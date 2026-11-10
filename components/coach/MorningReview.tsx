"use client";

import { Check, Clock, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { runMorningReview } from "@/lib/ai/morning-review";
import type { MorningStatus } from "@/lib/ai/morning-status";

/**
 * This morning's AI review, on the coach's button: athletes wake and sync at different times, so
 * it shows whose overnight data is in and reviews just those. Press again later for the rest.
 */
export default function MorningReview({ status }: { status: MorningStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const { athletes } = status;
  if (!athletes.length) return null;
  const toReview = athletes.filter((a) => a.ready && !a.briefed);
  const waiting = athletes.filter((a) => !a.ready);
  const done = athletes.filter((a) => a.briefed);

  const label = pending ? "Reviewing…" : toReview.length ? `Review ${toReview.length} ready` : waiting.length ? "Waiting for data" : "All reviewed";

  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">Morning review</h2>
          <p className="mt-1 text-sm text-white/60">AI reads last night&apos;s sleep, HRV and resting heart rate, flags who needs a change, and drafts each athlete&apos;s morning note.</p>
        </div>
        <button
          type="button"
          disabled={pending || !toReview.length}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const r = await runMorningReview();
              setMessage(r.message);
              router.refresh();
            })
          }
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm font-medium text-emerald-50 transition hover:bg-emerald-300/25 disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-white/45"
        >
          <Sparkles size={15} className={pending ? "animate-pulse" : ""} aria-hidden /> {label}
        </button>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Overnight data">
        {athletes.map((a) => (
          <li
            key={a.id}
            className={`flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 ${a.briefed ? "border-white/10 text-white/50" : a.ready ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100" : "border-white/10 text-white/55"}`}
          >
            {a.briefed ? <Check size={12} aria-hidden /> : a.ready ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden /> : <Clock size={12} aria-hidden />}
            {a.name}
            <span className="sr-only">{a.briefed ? " reviewed" : a.ready ? " data in" : " waiting for data"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-white/45" aria-live="polite">
        {message ??
          [toReview.length ? `${toReview.length} ready` : null, waiting.length ? `waiting on ${waiting.map((a) => a.name).join(", ")}` : null, done.length ? `${done.length} reviewed` : null]
            .filter(Boolean)
            .join(" · ")}
      </p>
    </section>
  );
}
