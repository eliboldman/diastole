"use client";

import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useToast } from "@/components/coach/Toast";
import StickerGlyph from "@/components/grit/StickerGlyph";
import { myStoreStickers } from "@/lib/grit/sticker-actions";
import { hasSecret } from "@/lib/secrets-local";
import { hideOneProp, hideProps, sendProps } from "@/lib/pod-props-actions";
import {
  ALL_STICKERS,
  ALWAYS_STICKERS,
  MAX_SEND,
  NOTE_MAX,
  milestone,
  rampStep,
  sportStickers,
  unlockedFor,
  unlockedForActivity,
  type ActivityFacts,
  type MemberData,
  type Sticker,
} from "@/lib/pod-stickers";

export type PropSend = {
  id: string;
  to_id: string;
  sticker: string;
  count: number;
  note: string | null;
  hidden: boolean;
  created_at: string;
  to_me: boolean;
  from_me: boolean;
  from_name: string;
  activity_id?: string | null;
  activity_sport?: string | null;
};
export type PropTotal = { to_id: string; sticker: string; total: number; all_time?: number; senders: number; from_me: boolean; hidden: boolean };
export type PropNote = Pick<PropSend, "id" | "sticker" | "note" | "hidden" | "from_me" | "to_me" | "from_name">;
/** Props for one activity instead of the person: the sheet adds that sport's stickers and the activity's unlocks. */
export type PropActivity = ActivityFacts & { id: string; label: string };

const fmt = (n: number) => (n >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString());
const buzz = (p: number | number[]) => navigator.vibrate?.(p);
// Only ever called from event handlers and timers, never while rendering.
const clock = () => Date.now();
const HOLD_MS = 400; // shorter than this is a tap (exactly one); longer starts the count-up
const MOVE_PX = 12; // a finger that slides further than this is scrolling, not tapping
const SEND_DELAY_MS = 2000; // time to keep tapping, or undo, before props go out

type Burst = { id: number; sticker: Sticker; n: number };
const QUICK = ALL_STICKERS.clap;

export default function PodProps({
  podId,
  member,
  totals,
  notes,
  activity,
  actions,
  quickRef,
}: {
  podId: string;
  member: Partial<MemberData> & { id: string; name: string; is_me: boolean };
  totals: PropTotal[];
  notes: PropNote[];
  activity?: PropActivity;
  actions?: ReactNode; // extra buttons in the activity action row (comments)
  quickRef?: RefObject<(() => void) | null>; // lets the card send a quick 👏 (double-tap)
}) {
  const router = useRouter();
  const { show, element: toast } = useToast(4500);
  const first = member.name.split(" ")[0];
  // Found Icarus (typed it into search)? Its sticker joins the secret ones for this sender.
  const [icarus, setIcarus] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIcarus(hasSecret("icarus")), 0);
    return () => clearTimeout(t);
  }, []);
  const secrets = useMemo(() => {
    const earned = activity ? unlockedForActivity(activity) : member.wellness && member.activities ? unlockedFor(member as MemberData) : [];
    return icarus ? [...earned, { ...ALL_STICKERS.icarus, line: "Wings of wax, heart of gold." }] : earned;
  }, [member, activity, icarus]);
  const sportSet = useMemo(() => (activity ? sportStickers(activity.sport) : []), [activity]);

  // Local totals so sends land instantly; the server copy replaces them on refresh.
  // Keyed to the server totals they were added on top of, so a refresh drops them automatically.
  const [local, setLocal] = useState<{ base: PropTotal[]; add: Record<string, number> }>({ base: totals, add: {} });
  const extra = useMemo(() => (local.base === totals ? local.add : {}), [local, totals]);
  const bump = (k: string, n: number) =>
    setLocal((l) => {
      const add = l.base === totals ? l.add : {};
      return { base: totals, add: { ...add, [k]: (add[k] ?? 0) + n } };
    });
  const shown = useMemo(() => {
    const map = new Map(totals.map((t) => [t.sticker, { ...t }]));
    for (const [k, n] of Object.entries(extra)) {
      const t = map.get(k) ?? { to_id: member.id, sticker: k, total: 0, senders: 1, from_me: true, hidden: false };
      map.set(k, { ...t, total: t.total + n });
    }
    return [...map.values()].filter((t) => ALL_STICKERS[t.sticker]).sort((a, b) => b.total - a.total);
  }, [totals, extra, member.id]);

  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Sticker[] | null>(null); // Grit store stickers the sender owns
  const [note, setNote] = useState("");
  const noteRef = useRef("");
  const [peek, setPeek] = useState<string | null>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // An open sticker popover closes on a tap anywhere else, or Escape.
  useEffect(() => {
    if (!peek) return;
    const away = (e: PointerEvent) => {
      if (!chipsRef.current?.contains(e.target as Node)) setPeek(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPeek(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [peek]);
  const [wiggle, setWiggle] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  // ---- tap / hold combo
  const [combo, setCombo] = useState<{ sticker: Sticker; n: number } | null>(null);
  const comboRef = useRef<{ sticker: Sticker; n: number } | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setInterval>; start: number; base: number; sticker: Sticker; at: { x: number; y: number } | null; moved: boolean } | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taps = useRef(0);
  const [hint, setHint] = useState(false);

  const setN = (sticker: Sticker, n: number) => {
    const next = { sticker, n: Math.min(MAX_SEND, n) };
    const before = comboRef.current?.n ?? 0;
    if (milestone(next.n) !== milestone(before)) buzz(next.n >= 10_000 ? [20, 30, 20] : 12);
    comboRef.current = next;
    setCombo(next);
  };

  async function flush() {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    const c = comboRef.current;
    comboRef.current = null;
    setCombo(null);
    if (!c) return;
    const id = clock();
    setBursts((b) => [...b, { id, sticker: c.sticker, n: Math.min(28, 6 + Math.round(Math.log10(c.n) * 5)) }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400);
    bump(c.sticker.key, c.n);
    const sentNote = noteRef.current.trim();
    const r = await sendProps(podId, member.id, c.sticker.key, c.n, sentNote, activity?.id);
    if (!r.ok) {
      bump(c.sticker.key, -c.n);
      show(r.error, { ok: false });
      return;
    }
    if (sentNote) {
      noteRef.current = "";
      setNote("");
    }
    const m = milestone(c.n);
    show(`${c.n.toLocaleString()} × ${c.sticker.emoji} sent to ${first}${activity ? ` for their ${activity.label.toLowerCase()}` : ""}${m && c.n >= 100 ? `. ${m.charAt(0).toUpperCase()}${m.slice(1)}.` : ""}`);
    router.refresh();
  }

  const scheduleFlush = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, SEND_DELAY_MS);
  };

  // A press counts only once it's a real tap (lifted without sliding) or a hold. Brushing past a
  // sticker or starting a scroll on one sends nothing.
  function press(sticker: Sticker, at?: { x: number; y: number }) {
    if (comboRef.current && comboRef.current.sticker.key !== sticker.key) void flush();
    const base = comboRef.current?.n ?? 0;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    const start = clock();
    hold.current = {
      start,
      base,
      sticker,
      at: at ?? null,
      moved: false,
      timer: setInterval(() => {
        const held = clock() - start;
        if (held < HOLD_MS || hold.current?.moved) return; // only a real hold starts counting up
        const c = comboRef.current;
        if (!c || c.n === base) setN(sticker, base + 1);
        else setN(c.sticker, c.n + rampStep(held - HOLD_MS));
      }, 80),
    };
  }

  // A finger that slides off the sticker is a scroll, not a tap.
  function move(e: { clientX: number; clientY: number }) {
    const h = hold.current;
    if (!h?.at || h.moved) return;
    if (Math.hypot(e.clientX - h.at.x, e.clientY - h.at.y) > MOVE_PX) cancel();
  }

  // The browser took the gesture, or the finger slid away: drop the press (a hold keeps what it counted).
  function cancel() {
    const h = hold.current;
    if (!h) return;
    clearInterval(h.timer);
    hold.current = null;
    const c = comboRef.current;
    if (c && clock() - h.start < HOLD_MS) {
      if (h.base === 0) {
        comboRef.current = null;
        setCombo(null);
        return;
      }
      comboRef.current = { ...c, n: h.base };
      setCombo(comboRef.current);
    }
    if (comboRef.current) scheduleFlush();
  }

  function release() {
    const h = hold.current;
    if (!h) return;
    clearInterval(h.timer);
    hold.current = null;
    const quick = clock() - h.start < HOLD_MS;
    if (quick) {
      setN(h.sticker, h.base + 1);
      buzz(6);
      if (++taps.current === 4) setHint(true); // they're tapping a lot: whisper the secret
    } else setHint(false);
    scheduleFlush();
  }

  // Changed your mind: nothing still counting gets sent.
  function undo() {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    if (hold.current) clearInterval(hold.current.timer);
    hold.current = null;
    comboRef.current = null;
    setCombo(null);
    buzz([6, 30, 6]);
  }

  useEffect(
    () => () => {
      if (hold.current) clearInterval(hold.current.timer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

  // Double-tap on the card: one quick 👏, folded into a running combo like taps on the button.
  useEffect(() => {
    if (!quickRef) return;
    quickRef.current = () => {
      if (member.is_me) return openSheet();
      press(QUICK);
      release();
    };
    return () => {
      quickRef.current = null;
    };
  });

  // Close the sheet: send anything still counting first.
  const close = () => {
    if (comboRef.current) void flush();
    setOpen(false);
    setHint(false);
    taps.current = 0;
  };

  function openSheet() {
    if (member.is_me) {
      setWiggle((w) => w + 1);
      buzz([8, 40, 8]);
      show(activity ? "No props for your own workout. Humble, we know." : "You can't heckle yourself. We checked.", { ok: false });
      return;
    }
    setOpen(true);
    if (!mine) void myStoreStickers().then(setMine);
  }

  async function hideNote(id: string) {
    const r = await hideOneProp(id);
    if (!r.ok) return show(r.error, { ok: false });
    show("Note hidden. Nobody saw anything.");
    router.refresh();
  }

  async function hide(key: string) {
    setPeek(null);
    const r = await hideProps(podId, key, activity?.id);
    if (!r.ok) return show(r.error, { ok: false });
    show(`${ALL_STICKERS[key].emoji} hidden. Nobody saw anything.`);
    router.refresh();
  }

  const stickerButton = (s: Sticker, big = false) => (
    <button
      key={s.key}
      type="button"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press(s, { x: e.clientX, y: e.clientY });
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex select-none touch-manipulation items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-90 ${
        combo?.sticker.key === s.key ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
      } ${big ? "col-span-2" : ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      <StickerGlyph s={s} className="text-2xl leading-none" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{s.label}</span>
        {s.line && <span className="block text-xs text-white/55">{s.line}</span>}
      </span>
      {/* The running count sits on the sticker you're holding, so it's visible wherever the sheet is scrolled. */}
      {combo?.sticker.key === s.key && (
        <span
          key={milestone(combo.n) ?? "x"}
          className="success-pop pointer-events-none absolute -top-3 right-2 z-10 flex items-baseline gap-1.5 rounded-full border border-emerald-300/40 bg-panel px-2.5 py-0.5 text-sm font-semibold tabular-nums text-emerald-50 shadow-lg"
          aria-live="polite"
        >
          ×{combo.n.toLocaleString()}
          {milestone(combo.n) && <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-amber-200/85">{milestone(combo.n)}</span>}
        </span>
      )}
    </button>
  );

  return (
    <div className={`relative ${activity ? "mt-4" : "mt-5 border-t border-white/[0.09] pt-4"}`}>
      {/* Received */}
      {!activity && shown.length > 0 && <p className="mb-2 text-[11px] uppercase tracking-[0.15em] text-white/45">Today&apos;s props</p>}
      {shown.length > 0 && (
        <div ref={chipsRef} className="mb-3 flex flex-wrap gap-1.5">
          {shown.map((t) => {
            const s = ALL_STICKERS[t.sticker];
            return (
              <span key={t.sticker} className="relative">
                <button
                  type="button"
                  onClick={() => setPeek(peek === t.sticker ? null : t.sticker)}
                  className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-90 ${
                    t.hidden ? "border-dashed border-white/15 opacity-50" : s.tone === "props" ? "border-emerald-300/20 bg-emerald-300/[0.07]" : "border-amber-300/20 bg-amber-300/[0.06]"
                  }`}
                >
                  <StickerGlyph s={s} />
                  <span className="tabular-nums text-white/80">{fmt(t.total)}</span>
                </button>
                {peek === t.sticker && (
                  <span className="toast-in absolute bottom-full left-0 z-20 mb-2 w-56 rounded-2xl border border-white/10 bg-panel/95 p-3 text-xs text-white/70 shadow-2xl backdrop-blur-xl">
                    <span className="block text-sm font-medium text-white">
                      <StickerGlyph s={s} /> {s.label}
                    </span>
                    {`${t.total.toLocaleString()} ${activity ? "" : "today "}from ${t.senders} ${t.senders === 1 ? (t.from_me ? "person (you)" : "person") : "people"}`}
                    {t.all_time && t.all_time > t.total ? <span className="block text-white/50">{t.all_time.toLocaleString()} all-time</span> : null}
                    {t.hidden && <span className="block text-white/50">Hidden by {first}. Only you can see it.</span>}
                    {member.is_me && !t.hidden && (
                      <button onClick={() => hide(t.sticker)} className="mt-2 block min-h-9 text-red-200 hover:underline">
                        Hide these
                      </button>
                    )}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {notes.length > 0 && (
        <ul className="mb-3 grid gap-1.5">
          {notes.slice(0, 3).map((n) => (
            <li key={n.id} className={`flex items-start gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-sm ${n.hidden ? "opacity-45" : ""}`}>
              <span aria-hidden>{ALL_STICKERS[n.sticker] && <StickerGlyph s={ALL_STICKERS[n.sticker]} />}</span>
              <span className="min-w-0 flex-1 break-words text-white/75">
                &ldquo;{n.note}&rdquo; <span className="text-white/45">— {n.from_me ? "you" : n.from_name}</span>
              </span>
              {n.to_me && !n.hidden && (
                <button onClick={() => hideNote(n.id)} className="shrink-0 text-xs text-white/45 hover:text-red-200">
                  Hide
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {activity ? (
        <div className="flex flex-wrap items-center gap-2">
          {!member.is_me && (
            <button
              type="button"
              aria-label="Give a clap. Hold for more."
              onPointerDown={(e) => {
                if (e.pointerType === "mouse" && e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                press(QUICK, { x: e.clientX, y: e.clientY });
              }}
              onPointerMove={move}
              onPointerUp={release}
              onPointerCancel={cancel}
              onContextMenu={(e) => e.preventDefault()}
              className={`flex min-h-11 select-none touch-manipulation items-center gap-2 rounded-full border px-4 text-sm transition active:scale-90 ${
                combo && !open ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-50" : "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-50/90 hover:bg-emerald-300/[0.14]"
              }`}
              style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            >
              <span aria-hidden className="text-base leading-none">👏</span> Props
            </button>
          )}
          {actions}
          {!member.is_me && (
          <button
            key={wiggle}
            type="button"
            onClick={openSheet}
            className={`flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/75 transition active:scale-95 hover:bg-white/[0.09] ${wiggle ? "prop-wiggle" : ""}`}
          >
            <Sparkles size={15} className={secrets.length > 0 ? "text-amber-200" : "text-white/55"} aria-hidden />
            Stickers
            {secrets.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-200" aria-label="Something's unlocked" />}
          </button>
          )}
          {/* The quick combo counter, while the sheet is closed */}
          {combo && !open && (
            <span key={milestone(combo.n) ?? "x"} className="success-pop pointer-events-none flex items-baseline gap-2 tabular-nums" aria-live="polite">
              <span className="text-lg font-semibold">
                <StickerGlyph s={combo.sticker} /> ×{combo.n.toLocaleString()}
              </span>
              {milestone(combo.n) && <span className="text-[11px] uppercase tracking-[0.2em] text-amber-200/80">{milestone(combo.n)}</span>}
            </span>
          )}
          {combo && !open && (
            <button type="button" onClick={undo} className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-white/60 hover:text-white">
              <X size={14} aria-hidden /> Undo
            </button>
          )}
        </div>
      ) : (
        <button
          key={wiggle}
          type="button"
          onClick={openSheet}
          className={`flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.09] ${wiggle ? "prop-wiggle" : ""}`}
        >
          <span aria-hidden>🐐</span> Send props
          {!member.is_me && secrets.length > 0 && <Sparkles size={14} className="text-amber-200/80" aria-label="Something's unlocked" />}
        </button>
      )}

      {/* Bursts fly off the button after a send */}
      {bursts.map((b) => (
        <span key={b.id} className="pointer-events-none absolute bottom-4 left-12" aria-hidden>
          {Array.from({ length: b.n }, (_, i) => (
            <span
              key={i}
              className="prop-burst absolute text-xl"
              style={
                {
                  "--dx": `${Math.round(Math.cos((i / b.n) * Math.PI * 2 + b.id) * (50 + ((i * 37) % 70)))}px`,
                  "--dy": `${Math.round(-40 - ((i * 53) % 110))}px`,
                  "--r": `${(i * 47) % 360}deg`,
                  animationDelay: `${(i % 6) * 25}ms`,
                } as CSSProperties
              }
            >
              <StickerGlyph s={b.sticker} />
            </span>
          ))}
        </span>
      ))}

      {/* Portaled: cards use backdrop-filter, which would trap a fixed sheet inside the card. */}
      {open &&
        createPortal(
          <>
          <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px]" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label={`Send props to ${first}`}
            className="toast-in fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] overflow-y-auto rounded-t-[32px] border border-white/10 bg-panel/95 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]"
          >
            <div className="flex items-center justify-between">
              <h3 className="min-w-0 truncate text-lg font-medium">
                To {first}
                {activity && <span className="text-white/50"> · {activity.label}</span>}
              </h3>
              <button onClick={close} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06]">
                <X size={18} />
              </button>
            </div>

            <label className="mt-3 block">
              <span className="sr-only">Add a note</span>
              <input
                value={note}
                maxLength={NOTE_MAX}
                onChange={(e) => {
                  setNote(e.target.value);
                  noteRef.current = e.target.value;
                }}
                placeholder="Add a note (optional), then pick a sticker"
                className="min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-base text-white placeholder:text-white/40 focus:border-emerald-300/40 focus:outline-none sm:text-sm"
              />
              {note.length > NOTE_MAX - 30 && <span className="mt-1 block text-right text-xs text-white/45">{NOTE_MAX - note.length} left</span>}
            </label>

            {/* The counter climbs while a sticker is held */}
            <div className="flex h-20 flex-col items-center justify-center">
              {combo ? (
                <>
                  <span key={milestone(combo.n) ?? "x"} className="success-pop text-3xl font-semibold tabular-nums">
                    <StickerGlyph s={combo.sticker} /> ×{combo.n.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-amber-200/80">
                    {milestone(combo.n) ?? "\u00a0"}
                    <button type="button" onClick={undo} className="min-h-9 normal-case tracking-normal text-white/60 underline-offset-2 hover:text-white hover:underline">
                      Undo
                    </button>
                  </span>
                </>
              ) : hint ? (
                <span className="row-in text-sm text-white/50">psst… try holding one down</span>
              ) : null}
            </div>

            {secrets.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-amber-200/80">
                  <Sparkles size={13} /> Unlocked by {activity ? "this workout" : `${first}'s numbers`}
                </p>
                <div className="grid grid-cols-2 gap-2">{secrets.map((s) => stickerButton(s, true))}</div>
              </section>
            )}
            {sportSet.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-sky-200/75">{activity!.label}</p>
                <div className="grid grid-cols-2 gap-2">{sportSet.map((s) => stickerButton(s))}</div>
              </section>
            )}
            {mine && mine.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-emerald-200/70">Yours, from the Grit store</p>
                <div className="grid grid-cols-2 gap-2">{mine.map((s) => stickerButton(s))}</div>
              </section>
            )}
            <section className="mb-4">
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-emerald-200/70">Props</p>
              <div className="grid grid-cols-2 gap-2">{ALWAYS_STICKERS.filter((s) => s.tone === "props").map((s) => stickerButton(s))}</div>
            </section>
            <section>
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-amber-200/70">Heckles</p>
              <div className="grid grid-cols-2 gap-2">{ALWAYS_STICKERS.filter((s) => s.tone === "heckle").map((s) => stickerButton(s))}</div>
            </section>
          </div>
          </>,
          document.body,
        )}
      {/* Only set after a click, so this never runs during server rendering. */}
      {toast && createPortal(toast, document.body)}
    </div>
  );
}
