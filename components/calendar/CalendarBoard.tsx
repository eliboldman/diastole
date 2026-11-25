"use client";

import { Move, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type DragEvent } from "react";

import { FLAG_STYLE } from "@/components/coach/Flags";
import { useToast } from "@/components/coach/Toast";
import { PeekBody, type Peek } from "@/components/calendar/WorkoutPeek";
import type { Flag } from "@/lib/readiness/engine";
import { rescheduleWorkout } from "@/lib/workouts/actions";

export type CalItem =
  | { kind: "plan"; id: string; day: string; text: string; sub: string; done: boolean; movable: boolean; peek: Peek }
  | { kind: "done"; id: string; day: string; text: string; sub: string; href: string };

export type Span = "month" | "2weeks" | "week";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUBBLE_W = 340;

/**
 * The calendar grid. Tap a workout for its summary bubble; tap empty space in a day to list that day
 * below. Coaches drag planned workouts to another day to move them (on a phone: Move in the bubble,
 * then tap a day). Week spans show every session in full; the month shows the first few.
 */
export default function CalendarBoard({
  weeks, span, today, selected, month, items: initial, flags, dayHref,
}: {
  weeks: string[][];
  span: Span;
  today: string;
  selected: string;
  month: string | null; // "2026-11" on the month span: days outside it are dimmed
  items: CalItem[];
  flags: Record<string, Flag>;
  dayHref: string; // "/calendar?…&day=" — the day is appended
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [peek, setPeek] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [, start] = useTransition();
  const { show, element: toast } = useToast(7000);
  const bubble = useRef<HTMLDivElement>(null);

  // A fresh render from the server (after a move, or a new range) replaces the local copy.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const expanded = span !== "month";
  const byDay = new Map<string, CalItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  const open = peek ? items.find((i) => i.id === peek.id && i.kind === "plan") : null;
  const movingItem = moving ? items.find((i) => i.id === moving) : null;

  // Place the bubble under the workout, or above it when there's no room below; keep it on screen.
  useLayoutEffect(() => {
    const el = bubble.current;
    if (!peek || !el) return;
    const r = peek.rect;
    const w = Math.min(BUBBLE_W, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.left, window.innerWidth - w - 16));
    const above = r.bottom + 8 + el.offsetHeight > window.innerHeight && r.top - 8 - el.offsetHeight > 0;
    el.style.left = `${left}px`;
    el.style.top = above ? "" : `${r.bottom + 8}px`;
    el.style.bottom = above ? `${window.innerHeight - r.top + 8}px` : "";
    el.style.visibility = "visible";
  }, [peek]);

  useEffect(() => {
    if (!peek) return;
    const away = (e: PointerEvent) => !bubble.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-chip]") && setPeek(null);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPeek(null);
    const close = () => setPeek(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [peek]);

  useEffect(() => {
    if (!moving) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMoving(null);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [moving]);

  const setDay = (id: string, day: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, day } : x)));

  const move = (id: string, to: string) => {
    const w = items.find((x) => x.id === id);
    if (!w || w.kind !== "plan" || !w.movable || w.day === to) return;
    const from = w.day;
    setDay(id, to);
    start(async () => {
      const r = await rescheduleWorkout(id, to);
      if (!r.ok) {
        setDay(id, from);
        show(r.error, { ok: false });
        return;
      }
      const when = new Date(`${to}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      show(`Moved “${w.peek.title}” to ${when}.`, {
        onUndo: () => {
          setDay(id, from);
          start(async () => {
            const u = await rescheduleWorkout(id, from);
            if (!u.ok) show(u.error, { ok: false });
            router.refresh();
          });
        },
      });
      router.refresh();
    });
  };

  const onDrop = (e: DragEvent, day: string) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, day);
  };

  const tapDay = (day: string) => {
    if (moving) {
      const id = moving;
      setMoving(null);
      move(id, day);
      return;
    }
    router.push(`${dayHref}${day}`, { scroll: false });
  };

  const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <>
      {movingItem && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.08] px-4 py-2 text-sm text-emerald-50">
          <Move size={16} className="shrink-0 text-emerald-200" aria-hidden />
          <span className="min-w-0 flex-1">Tap the day to move “{movingItem.text}” to.</span>
          <button type="button" onClick={() => setMoving(null)} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-white/70 hover:text-white">
            <X size={15} aria-hidden /> Cancel
          </button>
        </div>
      )}

      <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.05] p-2 backdrop-blur-xl sm:p-3">
        <div className={`grid-cols-7 pb-1 text-center text-[11px] uppercase tracking-wider text-white/45 ${expanded ? "hidden sm:grid" : "grid"}`}>
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </span>
          ))}
        </div>
        <div className="grid gap-1">
          {weeks.map((week) => (
            <div key={week[0]} className={`grid gap-1 ${expanded ? "grid-cols-1 sm:grid-cols-7" : "grid-cols-7"}`}>
              {week.map((d) => {
                const list = byDay.get(d) ?? [];
                const flag = flags[d];
                const isSel = d === selected;
                const isToday = d === today;
                const dim = month && d.slice(0, 7) !== month;
                const shown = expanded ? list : list.slice(0, 3);
                return (
                  <div
                    key={d}
                    role="button"
                    tabIndex={0}
                    aria-label={moving ? `Move to ${fmtDay(d)}` : fmtDay(d)}
                    aria-current={isSel ? "date" : undefined}
                    onClick={() => tapDay(d)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), tapDay(d))}
                    onDragOver={(e) => { e.preventDefault(); setOver(d); }}
                    onDragLeave={() => setOver((o) => (o === d ? null : o))}
                    onDrop={(e) => onDrop(e, d)}
                    className={`group relative flex cursor-pointer flex-col rounded-2xl border p-1.5 text-left transition sm:p-2 ${
                      expanded ? "min-h-16 sm:min-h-44" : "min-h-14 sm:min-h-24"
                    } ${
                      over === d
                        ? "border-emerald-300/60 bg-emerald-300/[0.14]"
                        : moving
                          ? "border-dashed border-emerald-300/30 hover:bg-emerald-300/[0.08]"
                          : isSel
                            ? "border-emerald-300/40 bg-emerald-300/[0.09]"
                            : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                    } ${dim ? "opacity-35" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        {expanded && <span className="text-xs text-white/50 sm:hidden">{WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]}</span>}
                        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? "bg-emerald-300 font-semibold text-emerald-950" : "text-white/70"}`}>
                          {+d.slice(8)}
                        </span>
                      </span>
                      {flag && flag !== "unknown" && <span className={`h-2 w-2 rounded-full ${FLAG_STYLE[flag].dot}`} title={FLAG_STYLE[flag].label} />}
                    </span>

                    {/* Month on a phone: dots only. */}
                    {!expanded && (
                      <span className="mt-auto flex flex-wrap gap-0.5 pt-1 sm:hidden">
                        {list.slice(0, 4).map((i) => (
                          <span key={i.id} className={`h-1.5 w-1.5 rounded-full ${i.kind === "plan" && !i.done ? "border border-emerald-200/80" : "bg-white/70"}`} />
                        ))}
                      </span>
                    )}

                    <span className={`mt-1 min-w-0 gap-1 ${expanded ? "grid" : "hidden sm:grid"}`}>
                      {shown.map((i) =>
                        i.kind === "plan" ? (
                          <button
                            key={i.id}
                            type="button"
                            data-chip
                            draggable={i.movable}
                            onDragStart={(e) => {
                              setPeek(null);
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", i.id);
                            }}
                            onDragEnd={() => setOver(null)}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (moving) return tapDay(d);
                              const rect = e.currentTarget.getBoundingClientRect();
                              setPeek((p) => (p?.id === i.id ? null : { id: i.id, rect }));
                            }}
                            aria-expanded={peek?.id === i.id}
                            title={i.movable ? "Tap for details, drag to move" : undefined}
                            className={`min-w-0 rounded-md border px-1.5 py-0.5 text-left text-[11px] transition ${
                              i.done ? "border-white/5 bg-white/[0.08] text-white/75" : "border-emerald-300/25 text-emerald-100 hover:bg-emerald-300/[0.08]"
                            } ${i.movable ? "cursor-grab active:cursor-grabbing" : ""} ${peek?.id === i.id ? "ring-1 ring-emerald-300/60" : ""} ${expanded ? "py-1 sm:text-xs" : ""}`}
                          >
                            <span className="block truncate">{i.text}</span>
                            {expanded && i.sub && <span className="block truncate text-[10px] text-white/50 sm:text-[11px]">{i.sub}</span>}
                          </button>
                        ) : (
                          <Link
                            key={i.id}
                            href={i.href}
                            onClick={(e) => e.stopPropagation()}
                            className={`min-w-0 rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[11px] text-white/75 hover:bg-white/[0.12] ${expanded ? "py-1 sm:text-xs" : ""}`}
                          >
                            <span className="block truncate">{i.text}</span>
                            {expanded && i.sub && <span className="block truncate text-[10px] text-white/50 sm:text-[11px]">{i.sub}</span>}
                          </Link>
                        ),
                      )}
                      {list.length > shown.length && <span className="px-1 text-[11px] text-white/45">+{list.length - shown.length} more</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 px-2 pt-3 pb-1 text-[11px] text-white/50">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-emerald-200/80" /> Planned</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/70" /> Completed</span>
          {Object.keys(flags).length > 0 && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-300" /> Readiness</span>}
          {items.some((i) => i.kind === "plan" && i.movable) && <span className="hidden sm:inline">Drag a planned workout to move it.</span>}
        </div>
      </div>

      {open && open.kind === "plan" && (
        <div
          ref={bubble}
          role="dialog"
          aria-label={`${open.peek.title} summary`}
          style={{ visibility: "hidden", left: 0, top: 0, width: `min(${BUBBLE_W}px, calc(100vw - 32px))` }}
          className="row-in fixed z-[65] max-h-[70vh] overflow-y-auto rounded-2xl border border-emerald-300/20 bg-[#0c1512]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {open.peek.who && <span className="text-white/55">{open.peek.who} · </span>}
                {open.peek.title}
              </p>
              <p className="text-xs text-white/55">{[open.peek.sport, fmtDay(open.day), open.peek.badge.label].join(" · ")}</p>
            </div>
            <button type="button" onClick={() => setPeek(null)} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/50 hover:text-white">
              <X size={16} aria-hidden />
            </button>
          </div>
          <PeekBody w={open.peek}>
            {open.movable && (
              <button
                type="button"
                onClick={() => {
                  setMoving(open.id);
                  setPeek(null);
                }}
                className="inline-flex min-h-11 items-center gap-1.5 text-sm text-white/70 hover:text-white"
              >
                <Move size={14} aria-hidden /> Move
              </button>
            )}
          </PeekBody>
        </div>
      )}
      {toast}
    </>
  );
}
