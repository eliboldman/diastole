"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ToastState = { id: number; text: string; ok: boolean; onUndo?: () => void } | null;

/** A bottom toast with an optional Undo button. Auto-hides after `ms`. */
export function useToast(ms = 8000) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, opts: { ok?: boolean; onUndo?: () => void } = {}) => {
      if (timer.current) clearTimeout(timer.current);
      const id = Date.now();
      setToast({ id, text, ok: opts.ok ?? true, onUndo: opts.onUndo });
      timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), ms);
    },
    [ms],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const element = toast ? (
    <div
      key={toast.id}
      role="status"
      className="toast-in fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-panel/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl md:bottom-6"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${toast.ok ? "bg-emerald-300" : "bg-red-400"}`} aria-hidden />
      <span className="min-w-0 flex-1 text-white/85">{toast.text}</span>
      {toast.onUndo && (
        <button
          onClick={() => {
            const undo = toast.onUndo;
            setToast(null);
            undo?.();
          }}
          className="min-h-11 shrink-0 rounded-xl px-3 font-semibold text-emerald-200 active:scale-95"
        >
          Undo
        </button>
      )}
    </div>
  ) : null;

  return { show, element };
}
