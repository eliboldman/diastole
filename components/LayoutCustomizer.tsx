"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { saveLayout } from "@/lib/layout-actions";
import { LAYOUT_PAGES, resolveLayout, type LayoutPage, type PageLayout } from "@/lib/layout-prefs";

/**
 * "Customize" button + sheet: show or hide each section of a page and move it up or down.
 * Changes apply right away and save to the account, so they follow the person to every device.
 */
export default function LayoutCustomizer({ page, initial }: { page: LayoutPage; initial: PageLayout }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [layout, setLayout] = useState(initial);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const labels = Object.fromEntries(LAYOUT_PAGES[page].map((s) => [s.key, s.label])) as Record<string, string>;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = (next: PageLayout | null) => {
    if (next) setLayout(next);
    startTransition(async () => {
      const r = await saveLayout(page, next);
      setStatus(r.ok ? "idle" : "error");
      if (r.ok) router.refresh();
    });
  };
  const move = (i: number, dir: -1 | 1) => {
    const order = [...layout.order];
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    commit({ ...layout, order });
  };
  const toggle = (key: string) =>
    commit({ ...layout, hidden: layout.hidden.includes(key) ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key] });
  const reset = () => {
    setLayout(resolveLayout(page, null));
    commit(null);
  };

  const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 transition active:scale-90 hover:bg-white/[0.08] disabled:opacity-25";

  const sheet = (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Customize this page">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-panel/95 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl backdrop-blur-2xl sm:rounded-[28px]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Customize {page === "today" ? "Today" : "Me"}</h2>
          <button onClick={() => setOpen(false)} className={iconBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-white/55">Hide what you don&apos;t want to see and move the rest into your order. Your coach&apos;s view doesn&apos;t change.</p>
        <ul className="space-y-1.5">
          {layout.order.map((key, i) => {
            const hidden = layout.hidden.includes(key);
            return (
              <li key={key} className={`flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] py-1 pl-4 pr-1 ${hidden ? "opacity-60" : ""}`}>
                <span className={`min-w-0 flex-1 truncate text-sm ${hidden ? "text-white/45 line-through" : ""}`}>{labels[key]}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label={`Move ${labels[key]} up`}>
                  <ArrowUp size={16} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === layout.order.length - 1} className={iconBtn} aria-label={`Move ${labels[key]} down`}>
                  <ArrowDown size={16} />
                </button>
                <button
                  onClick={() => toggle(key)}
                  className={`${iconBtn} ${hidden ? "" : "text-emerald-200"}`}
                  aria-pressed={!hidden}
                  aria-label={hidden ? `Show ${labels[key]}` : `Hide ${labels[key]}`}
                >
                  {hidden ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={reset} className="flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm text-white/55 hover:bg-white/[0.06]">
            <RotateCcw size={15} /> Reset to default
          </button>
          <span className="text-xs text-white/45" aria-live="polite">
            {status === "error" ? "Couldn't save. Check your connection." : "Saves automatically"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1]"
      >
        <SlidersHorizontal size={16} aria-hidden /> Customize
      </button>
      {mounted && open && createPortal(sheet, document.body)}
    </>
  );
}
