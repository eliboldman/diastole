"use client";

import { Move, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type DragEvent, type TouchEvent as ReactTouchEvent } from "react";

import { FLAG_STYLE } from "@/components/coach/Flags";
import { useToast } from "@/components/coach/Toast";
import { PeekBody, type Peek } from "@/components/calendar/WorkoutPeek";
import type { Flag } from "@/lib/readiness/engine";
import { rescheduleWorkout } from "@/lib/workouts/actions";

/** One session on the calendar: the plan and what was recorded for it, or an activity with no plan. */
export type CalItem = { id: string; day: string; sport: string; who: string; text: string; sub: string; done: boolean; movable: boolean; peek: Peek };

export type Span = "month" | "2weeks" | "week";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUBBLE_W = 340;
const SPORT_EDGE: Record<string, string> = { run: "border-l-emerald-300", bike: "border-l-amber-300", swim: "border-l-sky-300", strength: "border-l-fuchsia-300" };
// Week spans fill the window: one row (or two) of seven days, sized to the screen so nothing scrolls sideways.
const ROW_H: Record<Span, string> = {
  week: "h-[calc(100dvh-21rem)] min-h-[15rem] sm:h-[calc(100dvh-19rem)]",
  "2weeks": "h-[calc((100dvh-21.5rem)/2)] min-h-[9rem] sm:h-[calc((100dvh-20rem)/2)] sm:min-h-[11rem]",
  month: "min-h-14 sm:min-h-24",
};

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
  // Touch drag: press and hold a workout, then drag it (phones have no native drag and drop).
  const [touchDrag, setTouchDrag] = useState<{ id: string; text: string; x: number; y: number } | null>(null);
  const hold = useRef<{ id: string; text: string; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const dragged = useRef(false); // swallow the tap that ends a touch drag

  // A fresh render from the server (after a move, or a new range) replaces the local copy.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const expanded = span !== "month";
  const byDay = new Map<string, CalItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  const open = peek ? items.find((i) => i.id === peek.id) : null;
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

  const holdStart = (e: ReactTouchEvent, id: string, text: string) => {
    const t = e.touches[0];
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = {
      id, text, x: t.clientX, y: t.clientY,
      timer: setTimeout(() => {
        const h = hold.current;
        if (!h) return;
        hold.current = null;
        dragged.current = true;
        setPeek(null);
        navigator.vibrate?.(12);
        setTouchDrag({ id: h.id, text: h.text, x: h.x, y: h.y });
      }, 380),
    };
  };
  const holdMove = (e: ReactTouchEvent) => {
    const h = hold.current;
    const t = e.touches[0];
    if (h && Math.hypot(t.clientX - h.x, t.clientY - h.y) > 8) {
      clearTimeout(h.timer); // the finger moved first: it's a scroll, not a drag
      hold.current = null;
    }
  };
  const holdEnd = () => {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  };

  const setDay = (id: string, day: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, day } : x)));

  const move = (id: string, to: string) => {
    const w = items.find((x) => x.id === id);
    if (!w || !w.movable || w.day === to) return;
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

  // While a touch drag is live: follow the finger, light up the day under it, stop the page scrolling
  // (but nudge it near the top or bottom edge so a day off screen can be reached), drop on release.
  const dragId = touchDrag?.id ?? null;
  useEffect(() => {
    if (!dragId) return;
    let y = 0;
    let target: string | null = null;
    let raf = 0;
    const edge = () => {
      const h = window.innerHeight;
      if (y && y < 90) window.scrollBy(0, -10);
      else if (y > h - 120) window.scrollBy(0, 10);
      raf = requestAnimationFrame(edge);
    };
    raf = requestAnimationFrame(edge);
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      y = t.clientY;
      setTouchDrag((d) => (d ? { ...d, x: t.clientX, y: t.clientY } : d));
      const cell = (document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-day]");
      target = cell?.dataset.day ?? null;
      setOver(target);
    };
    const onEnd = () => {
      setTouchDrag(null);
      setOver(null);
      setTimeout(() => (dragged.current = false), 400); // in case the browser sends no click after the drag
      if (target) move(dragId, target);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    // move() is re-created each render; the drag only needs the one current when it started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

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
          <span className="min-w-0 flex-1">Tap the day to move “{movingItem.who ? `${movingItem.who} · ` : ""}{movingItem.text}” to.</span>
          <button type="button" onClick={() => setMoving(null)} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-white/70 hover:text-white">
            <X size={15} aria-hidden /> Cancel
          </button>
        </div>
      )}

      <div className={`mt-4 rounded-[28px] border border-white/10 bg-white/[0.05] backdrop-blur-xl sm:p-3 ${expanded ? "-mx-3 p-1 sm:mx-0" : "p-2"}`}>
        <div className={`grid-cols-7 pb-1 text-center text-[11px] uppercase tracking-wider text-white/45 grid`}>
          {WEEKDAYS.map((d) => (
            <span key={d} className="py-1">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </span>
          ))}
        </div>
        <div className="grid gap-1">
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 gap-0.5 sm:gap-1">
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
                    data-day={d}
                    role="button"
                    tabIndex={0}
                    aria-label={moving ? `Move to ${fmtDay(d)}` : fmtDay(d)}
                    aria-current={isSel ? "date" : undefined}
                    onClick={() => tapDay(d)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), tapDay(d))}
                    onDragOver={(e) => { e.preventDefault(); setOver(d); }}
                    onDragLeave={() => setOver((o) => (o === d ? null : o))}
                    onDrop={(e) => onDrop(e, d)}
                    className={`group relative flex min-w-0 cursor-pointer flex-col rounded-xl border text-left transition sm:rounded-2xl sm:p-2 ${expanded ? "overflow-hidden p-0.5" : "p-1.5"} ${ROW_H[span]} ${
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
                          <span key={i.id} className={`h-1.5 w-1.5 rounded-full ${!i.done ? "border border-emerald-200/80" : "bg-white/70"}`} />
                        ))}
                      </span>
                    )}

                    <span className={`mt-1 min-w-0 content-start gap-0.5 sm:gap-1 ${expanded ? "grid flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]" : "hidden sm:grid"}`}>
                      {shown.map((i) => (
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
                          onTouchStart={i.movable ? (e) => holdStart(e, i.id, i.text) : undefined}
                          onTouchMove={i.movable ? holdMove : undefined}
                          onTouchEnd={i.movable ? holdEnd : undefined}
                          onContextMenu={i.movable ? (e) => e.preventDefault() : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (dragged.current) return void (dragged.current = false);
                            if (moving) return tapDay(d);
                            const rect = e.currentTarget.getBoundingClientRect();
                            setPeek((p) => (p?.id === i.id ? null : { id: i.id, rect }));
                          }}
                          aria-expanded={peek?.id === i.id}
                          title={i.movable ? "Tap for details. Drag (or press and hold on a phone) to move." : undefined}
                          className={`min-w-0 rounded-md border border-l-2 px-1.5 py-0.5 text-left text-[11px] transition ${SPORT_EDGE[i.sport] ?? ""} ${
                            i.done ? "border-white/5 bg-white/[0.08] text-white/75" : "border-emerald-300/25 text-emerald-100 hover:bg-emerald-300/[0.08]"
                          } ${i.movable ? "cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing" : ""} ${touchDrag?.id === i.id ? "opacity-40" : ""} ${peek?.id === i.id ? "ring-1 ring-emerald-300/60" : ""} ${expanded ? "px-1 py-1 text-[9px] leading-tight sm:px-1.5 sm:text-xs" : ""}`}
                        >
                          {expanded ? (
                            <span className="pointer-events-none block">
                              {i.who && <span className="block truncate font-semibold text-white/70">{i.who}</span>}
                              <span className="line-clamp-3 overflow-hidden [overflow-wrap:normal] [word-break:normal] sm:line-clamp-2">{i.text}</span>
                            </span>
                          ) : (
                            <span className="pointer-events-none block truncate">{i.who ? `${i.who} · ` : ""}{i.text}</span>
                          )}
                          {expanded && i.sub && <span className="pointer-events-none mt-0.5 block truncate text-[9px] text-white/50 sm:text-[11px]">{i.sub}</span>}
                        </button>
                      ))}
                      {list.length > shown.length && <span className="px-1 text-[11px] text-white/45">+{list.length - shown.length} more</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className={`flex flex-wrap gap-x-4 gap-y-1 px-2 pb-1 text-[11px] text-white/50 ${expanded ? "pt-1.5 sm:pt-3" : "pt-3"}`}>
          <span className={`items-center gap-1.5 ${expanded ? "hidden sm:flex" : "flex"}`}><span className="h-2 w-2 rounded-full border border-emerald-200/80" /> Planned</span>
          <span className={`items-center gap-1.5 ${expanded ? "hidden sm:flex" : "flex"}`}><span className="h-2 w-2 rounded-full bg-white/70" /> Completed</span>
          {Object.keys(flags).length > 0 && <span className={`items-center gap-1.5 ${expanded ? "hidden sm:flex" : "flex"}`}><span className="h-2 w-2 rounded-full bg-emerald-300" /> Readiness</span>}
          {items.some((i) => i.movable) && (
            <span>
              <span className="hidden sm:inline">Drag a planned workout to move it.</span>
              <span className="sm:hidden">{expanded ? "Press and hold a workout, then drag it to move it." : "Switch to Week or 2 weeks to drag workouts."}</span>
            </span>
          )}
        </div>
      </div>

      {open && (
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
      {touchDrag && (
        <div
          aria-hidden
          style={{ left: touchDrag.x, top: touchDrag.y }}
          className="pointer-events-none fixed z-[70] -translate-x-1/2 -translate-y-[130%] rounded-lg border border-emerald-300/60 bg-emerald-950/95 px-3 py-1.5 text-xs text-emerald-50 shadow-2xl shadow-black/60"
        >
          {touchDrag.text}
        </div>
      )}
      {toast}
    </>
  );
}
