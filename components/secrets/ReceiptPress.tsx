"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import SecretSparkle from "@/components/secrets/SecretSparkle";
import StoryShare from "@/components/StoryShare";
import { eggState, findSecret } from "@/lib/secrets-client";

const STYLES = [
  ["receipt", "Receipt"],
  ["ticket", "Ticket stub"],
  ["pixel", "Pixel"],
] as const;

/** Long-press a finished workout's numbers for a retro receipt to share (the Retro Receipt secret). */
export default function ReceiptPress({ activityId, children }: { activityId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<(typeof STYLES)[number][0]>("receipt");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    start.current = null;
  };

  return (
    <div
      className="relative select-none"
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={(e) => open || e.preventDefault()}
      onPointerDown={(e) => {
        const s = eggState();
        if (!s.on) return;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          navigator.vibrate?.(12);
          setOpen(true);
          void findSecret("receipt");
        }, 650);
      }}
      onPointerMove={(e) => {
        // A scroll, not a press.
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
    >
      {children}
      <SecretSparkle id="receipt" className="right-2 top-2" />
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="Workout receipt" className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
            <div onClick={(e) => e.stopPropagation()} className="toast-in max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-[28px]">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">Your receipt</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-xl text-white/55 hover:bg-white/[0.06]">
                  <X size={18} />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.04] p-1" role="radiogroup" aria-label="Style">
                {STYLES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={style === id} onClick={() => setStyle(id)} className={`min-h-10 rounded-xl text-sm ${style === id ? "bg-white/[0.12] text-white" : "text-white/60"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <StoryShare key={style} src={`/api/receipt/${activityId}?style=${style}`} aspect="aspect-[4/5]" alt="Workout receipt" filename="diastole-receipt.png" title="My workout receipt" />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
