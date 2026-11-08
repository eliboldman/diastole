"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SECRET_EVENT, type SecretMoment } from "@/lib/secrets-client";

/** A short unlock moment at the top of the screen: under 2.5 s, tap to dismiss, never blocks anything. */
export default function SecretToast() {
  const [m, setM] = useState<SecretMoment | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      setM((e as CustomEvent<SecretMoment>).detail);
      navigator.vibrate?.([8, 30, 8]);
      if (t) clearTimeout(t);
      t = setTimeout(() => setM(null), 2400);
    };
    window.addEventListener(SECRET_EVENT, on);
    return () => {
      window.removeEventListener(SECRET_EVENT, on);
      if (t) clearTimeout(t);
    };
  }, []);
  if (!m) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-[95] flex justify-center px-4 md:top-6">
      <Link href="/me/secrets" onClick={() => setM(null)} className="spotlight-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-amber-200/30 bg-panel/95 px-4 py-3 shadow-[0_0_40px_rgba(253,230,138,0.18)] backdrop-blur-xl">
        <span className="text-2xl" aria-hidden>
          {m.emoji}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-amber-50">{m.title}</span>
          <span className="block text-xs text-white/55">{m.detail}</span>
        </span>
      </Link>
    </div>
  );
}
