"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { TAB_ICON } from "@/components/layout/tab-icons";
import { MAX_TABS, MIN_TABS, TAB_OPTIONS, type TabRole } from "@/lib/tabs";
import { saveTabs } from "@/lib/tabs-actions";

/** Pick 3-5 bottom tabs and their order. Saves on its own; the bar updates right away. */
export default function TabBarSettings({ role, initial }: { role: TabRole; initial: string[] }) {
  const router = useRouter();
  const [tabs, setTabs] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const options = TAB_OPTIONS[role];
  const def = (id: string) => options.find((o) => o.id === id)!;

  const update = (next: string[]) => {
    setTabs(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      start(async () => {
        const r = await saveTabs(role, next);
        setStatus(r.ok ? "saved" : "error");
        if (r.ok) router.refresh();
      });
    }, 400);
  };
  const move = (i: number, d: -1 | 1) => {
    const n = [...tabs];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    update(n);
  };

  return (
    <div>
      {/* Preview, same look as the bar */}
      <div className="grid rounded-2xl border border-white/10 bg-canvas/80 py-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} aria-hidden>
        {tabs.map((id, i) => {
          const Icon = TAB_ICON[id];
          return (
            <span key={id} className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${i === 0 ? "text-emerald-200" : "text-white/55"}`}>
              {Icon && <Icon size={20} />}
              {def(id).label}
            </span>
          );
        })}
      </div>

      <ul className="mt-4 space-y-1.5">
        {tabs.map((id, i) => {
          const Icon = TAB_ICON[id];
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] py-1 pl-3 pr-1">
              {Icon && <Icon size={17} className="shrink-0 text-white/60" aria-hidden />}
              <span className="min-w-0 flex-1 truncate text-sm">{def(id).label}</span>
              <button type="button" aria-label={`Move ${def(id).label} left`} disabled={i === 0} onClick={() => move(i, -1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/55 disabled:opacity-20">
                <ArrowUp size={15} />
              </button>
              <button type="button" aria-label={`Move ${def(id).label} right`} disabled={i === tabs.length - 1} onClick={() => move(i, 1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/55 disabled:opacity-20">
                <ArrowDown size={15} />
              </button>
              <button type="button" aria-label={`Remove ${def(id).label}`} disabled={tabs.length <= MIN_TABS} onClick={() => update(tabs.filter((x) => x !== id))} className="flex h-10 w-10 items-center justify-center rounded-lg text-white/45 disabled:opacity-20">
                <X size={15} />
              </button>
            </li>
          );
        })}
      </ul>

      {tabs.length < MAX_TABS && (
        <div className="mt-3 flex flex-wrap gap-2">
          {options
            .filter((o) => !tabs.includes(o.id))
            .map((o) => {
              const Icon = TAB_ICON[o.id];
              return (
                <button key={o.id} type="button" onClick={() => update([...tabs, o.id])} className="flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 px-3 text-sm text-white/70 hover:bg-white/[0.05]">
                  <Plus size={13} aria-hidden /> {Icon && <Icon size={14} aria-hidden />} {o.label}
                </button>
              );
            })}
        </div>
      )}
      <p className="mt-3 text-xs text-white/45" aria-live="polite">
        {status === "saved" ? "Saved. Your bar is updated." : status === "error" ? "Couldn't save. Try again." : `Pick ${MIN_TABS} to ${MAX_TABS}. Everything else stays in the menu (tap the logo).`}
      </p>
    </div>
  );
}
