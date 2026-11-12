"use client";

import { PartyPopper, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { sendBoost } from "@/lib/grit/actions";
import { haptic } from "@/lib/haptics";

export type Boost = { id: string; from_name: string; to_name: string; to_id: string };
const KEY = "diastole:boosts-seen";
const COLORS = ["var(--color-emerald-300)", "#fde68a", "#f9a8d4", "#7dd3fc", "#c4b5fd", "#fdba74"];

const seenSet = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};

/** Confetti raining down the screen for a few seconds. */
function Confetti() {
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {Array.from({ length: 70 }, (_, i) => (
        <span
          key={i}
          className="confetti-bit absolute top-0 block rounded-[2px]"
          style={
            {
              left: `${(i * 37) % 100}%`,
              width: `${6 + (i % 3) * 2}px`,
              height: `${10 + (i % 4) * 2}px`,
              background: COLORS[i % COLORS.length],
              "--dx": `${((i * 53) % 120) - 60}px`,
              "--r": `${(i * 97) % 720}deg`,
              "--t": `${2.6 + (i % 5) * 0.35}s`,
              animationDelay: `${(i % 14) * 70}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>,
    document.body,
  );
}

/**
 * Kudos boosts on a pod page: today's boosts as a banner (confetti the first time you see each),
 * and a button to send one when you own some. Members only; boosts last a day.
 */
export default function PodBoosts({ podId, boosts, members, meId, owned }: { podId: string; boosts: Boost[]; members: { id: string; name: string }[]; meId: string; owned: number }) {
  const router = useRouter();
  const [rain, setRain] = useState(false);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const seen = seenSet();
    const fresh = boosts.filter((b) => !seen.has(b.id));
    if (!fresh.length) return;
    const t = setTimeout(() => {
      setRain(true);
      haptic("success");
      try {
        localStorage.setItem(KEY, JSON.stringify([...seen, ...fresh.map((b) => b.id)].slice(-100)));
      } catch {}
    }, 500);
    const off = setTimeout(() => setRain(false), 5200);
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, [boosts]);

  const send = (toId: string) =>
    start(async () => {
      const r = await sendBoost(podId, toId);
      setOpen(false);
      setMsg(r.ok ? (r.message ?? "Boost sent.") : r.error);
      if (r.ok) {
        setRain(true);
        haptic("success");
        setTimeout(() => setRain(false), 5000);
        router.refresh();
      }
    });

  if (!boosts.length && owned <= 0 && !msg) return null;
  const others = members.filter((m) => m.id !== meId);

  return (
    <div className="mt-4">
      {boosts.length > 0 && (
        <p className="row-in flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-2.5 text-sm text-emerald-50">
          <PartyPopper size={16} className="shrink-0 text-emerald-200" aria-hidden />
          <span className="min-w-0">
            {boosts
              .slice(0, 3)
              .map((b) => `${b.from_name} boosted ${b.to_id === meId ? "you" : b.to_name}`)
              .join(" · ")}
            {boosts.length > 3 ? ` · +${boosts.length - 3} more` : ""}
          </span>
        </p>
      )}
      {owned > 0 && others.length > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.09]">
          <PartyPopper size={15} className="text-emerald-200" aria-hidden /> Send a kudos boost ({owned})
        </button>
      )}
      {msg && (
        <p role="status" className="mt-2 text-sm text-emerald-100/90">
          {msg}
        </p>
      )}
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
            <div role="dialog" aria-label="Send a kudos boost" className="toast-in fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-t-[32px] border border-white/10 bg-panel/95 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[26rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Who earned a boost?</h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06]">
                  <X size={18} />
                </button>
              </div>
              <p className="mt-1 text-sm text-white/55">Confetti on this pod&apos;s page for a day, with their name on it.</p>
              <ul className="mt-3 grid gap-1.5">
                {others.map((m) => (
                  <li key={m.id}>
                    <button type="button" disabled={pending} onClick={() => send(m.id)} className="flex min-h-12 w-full items-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-left transition active:scale-[0.99] hover:bg-white/[0.08] disabled:opacity-50">
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>,
          document.body,
        )}
      {rain && <Confetti />}
    </div>
  );
}
