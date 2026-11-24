"use client";

import { CalendarPlus, Camera, MessageCircle, NotebookPen, Plus, SmilePlus, Wind, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Action = { label: string; href: string; icon: LucideIcon };

// The things done several times a day, one tap from anywhere.
const ACTIONS: Record<"coach" | "athlete", Action[]> = {
  coach: [
    { label: "Log food", href: "/fuel?log=1", icon: Camera },
    { label: "Check in", href: "/go/checkin", icon: SmilePlus },
    { label: "Breathe", href: "/recovery/breathe", icon: Wind },
    { label: "Add my workout", href: "/go/workout", icon: CalendarPlus },
    { label: "Note for an athlete", href: "/athletes", icon: NotebookPen },
  ],
  athlete: [
    { label: "Log food", href: "/fuel?log=1", icon: Camera },
    { label: "Check in", href: "/go/checkin", icon: SmilePlus },
    { label: "Breathe", href: "/recovery/breathe", icon: Wind },
    { label: "Add a workout", href: "/go/workout", icon: CalendarPlus },
    { label: "Message my coach", href: "/messages", icon: MessageCircle },
  ],
};

/**
 * A "+" that opens the quick actions. `bar` is the phone tab-bar version (a tab-sized button, the
 * menu rising above the bar); otherwise a 44px icon button for the desktop top bar, opening below.
 */
export default function QuickActions({ role, bar = false }: { role: "coach" | "athlete"; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  const menu = useId();

  // Close on navigation, outside tap and Escape.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  const Icon = open ? X : Plus;
  return (
    <div ref={box} className={`relative ${bar ? "h-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menu}
        aria-label={open ? "Close quick actions" : "Quick actions"}
        className={
          bar
            ? "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/55 transition active:scale-95"
            : "flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/[0.06] hover:text-white"
        }
      >
        <span className={bar ? "flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300 text-emerald-950" : ""}>
          <Icon size={bar ? 18 : 19} strokeWidth={2.2} aria-hidden />
        </span>
        {bar && <span className="sr-only">Quick actions</span>}
      </button>
      {open && (
        <ul
          id={menu}
          className={`absolute z-[60] w-60 rounded-2xl border border-white/10 bg-panel/95 p-1.5 shadow-2xl backdrop-blur-2xl ${
            bar ? "bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2" : "right-0 top-[calc(100%+0.5rem)]"
          }`}
        >
          {ACTIONS[role].map((a) => (
            <li key={a.href}>
              <Link href={a.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] text-white/85 transition active:scale-[0.98] hover:bg-white/[0.06]">
                <a.icon size={18} className="text-emerald-200" aria-hidden />
                {a.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
