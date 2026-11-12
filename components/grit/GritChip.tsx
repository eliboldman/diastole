"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import { GritMark } from "@/components/grit/Art";
import { markGritSeen } from "@/lib/grit/actions";
import { haptic } from "@/lib/haptics";

/**
 * The grit balance at the top of Today (opens the store). When grit was earned since the last
 * visit, it counts up with a little bounce, a "+N" and a few shards, once, then marks it seen.
 */
export default function GritChip({ balance, fresh, reason }: { balance: number; fresh: number; reason?: string | null }) {
  const [shown, setShown] = useState(fresh > 0 ? balance - fresh : balance);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (fresh <= 0) return;
    const start = setTimeout(() => {
      setPop(true);
      haptic("success");
      const from = balance - fresh;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 700);
        setShown(Math.round(from + fresh * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      void markGritSeen();
    }, 700);
    return () => clearTimeout(start);
  }, [balance, fresh]);

  return (
    <Link
      href="/me/grit"
      aria-label={`${balance.toLocaleString()} grit. Open the Grit store.${fresh > 0 ? ` You earned ${fresh} since your last visit.` : ""}`}
      title={fresh > 0 && reason ? `+${fresh}: ${reason}` : "Grit: earned by training and recovery"}
      className="relative inline-flex min-h-11 items-center"
    >
      <span className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-emerald-300/25 bg-emerald-300/[0.08] px-3 py-1.5 text-sm font-semibold tabular-nums text-emerald-50 transition active:scale-95 hover:bg-emerald-300/[0.14] ${pop ? "grit-bounce grit-shine" : ""}`}>
        <GritMark size={16} />
        {shown.toLocaleString()}
      </span>
      {pop && (
        <>
          <span aria-hidden className="grit-float pointer-events-none absolute left-1/2 top-0 whitespace-nowrap text-sm font-bold text-emerald-200">
            +{fresh}
          </span>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="grit-shard pointer-events-none absolute left-1/2 top-1/2"
              style={{ "--dx": `${Math.round(Math.cos((i / 7) * Math.PI * 2) * (26 + (i % 3) * 8))}px`, "--dy": `${Math.round(Math.sin((i / 7) * Math.PI * 2) * (20 + (i % 2) * 8))}px`, "--r": `${i * 70}deg`, animationDelay: `${120 + i * 20}ms` } as CSSProperties}
            >
              <GritMark size={9} />
            </span>
          ))}
        </>
      )}
    </Link>
  );
}
