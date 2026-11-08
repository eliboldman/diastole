"use client";

import { Activity, BookOpen, CalendarDays, FileText, Orbit, Search, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { search, type SearchHit } from "@/lib/search";

const ICON: Record<SearchHit["kind"], typeof User> = {
  athlete: User,
  workout: CalendarDays,
  library: BookOpen,
  activity: Activity,
  pod: Orbit,
  page: FileText,
};
const GROUP: Record<SearchHit["kind"], string> = {
  athlete: "Athletes",
  workout: "Workouts",
  library: "Library",
  activity: "Activities",
  pod: "Pods",
  page: "Pages",
};

const OPEN_EVENT = "diastole:open-search";

/** A search button. Any number can exist; they all open the one dialog (SearchHost). */
export function SearchButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      aria-label="Search"
      className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white/70 transition active:scale-90 hover:bg-white/[0.08] hover:text-white ${className}`}
    >
      <Search size={19} />
    </button>
  );
}

/**
 * The search dialog, mounted once per page. Rendered into <body> so blurred top bars can't trap
 * it (an element with backdrop-filter becomes the containing block for fixed children).
 * Opens from any SearchButton, Ctrl/⌘-K or "/".
 */
export default function SearchHost() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) {
        setHits([]);
        return;
      }
      start(async () => {
        const found = await search(term);
        // A secret: typing "icarus" reveals the Icarus mode and sticker.
        setHits(/^icarus$/i.test(term) ? [{ kind: "page", title: "☀️ Icarus", sub: "You found a secret. Fly high, just not too close.", href: "/account/settings?secret=icarus#appearance" }, ...found] : found);
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    setHits([]);
    router.push(h.href);
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/60 p-3 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-sm sm:pt-24" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-lg rounded-[24px] border border-white/10 bg-panel/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-white/10 px-4">
              <Search size={18} className="shrink-0 text-white/45" aria-hidden />
              <input
                ref={input}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(hits.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter" && hits[active]) go(hits[active]);
                }}
                placeholder="Athletes, workouts, library, pages…"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
                aria-label="Search"
              />
              <button onClick={() => setOpen(false)} aria-label="Close search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {q.trim().length < 2 ? (
                <p className="px-3 py-4 text-sm text-white/45">Type at least 2 letters. Tip: press / or Ctrl-K anywhere.</p>
              ) : hits.length === 0 ? (
                <p className="px-3 py-4 text-sm text-white/45">{pending ? "Searching…" : "Nothing found."}</p>
              ) : (
                <ul>
                  {hits.map((h, i) => {
                    const Icon = ICON[h.kind];
                    const newGroup = i === 0 || hits[i - 1].kind !== h.kind;
                    return (
                      <li key={`${h.kind}${h.href}${i}`}>
                        {newGroup && <p className="px-3 pb-1 pt-3 text-[11px] uppercase tracking-[0.15em] text-white/40">{GROUP[h.kind]}</p>}
                        <button
                          onClick={() => go(h)}
                          onMouseEnter={() => setActive(i)}
                          className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left ${i === active ? "bg-white/[0.08]" : ""}`}
                        >
                          <Icon size={16} className="shrink-0 text-white/50" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{h.title}</span>
                            {h.sub && <span className="block truncate text-xs text-white/45">{h.sub}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
