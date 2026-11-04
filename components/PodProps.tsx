"use client";

import { Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { useToast } from "@/components/coach/Toast";
import { hideProps, sendProps } from "@/lib/pod-props-actions";
import { ALL_STICKERS, ALWAYS_STICKERS, MAX_SEND, milestone, rampStep, unlockedFor, type MemberData, type Sticker } from "@/lib/pod-stickers";

export type PropTotal = { to_id: string; sticker: string; total: number; senders: number; from_me: boolean; hidden: boolean };

const fmt = (n: number) => (n >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString());
const buzz = (p: number | number[]) => navigator.vibrate?.(p);
// Only ever called from event handlers and timers, never while rendering.
const clock = () => Date.now();

type Burst = { id: number; emoji: string; n: number };

export default function PodProps({
  podId,
  member,
  totals,
}: {
  podId: string;
  member: MemberData & { id: string; name: string; is_me: boolean };
  totals: PropTotal[];
}) {
  const router = useRouter();
  const { show, element: toast } = useToast(4500);
  const first = member.name.split(" ")[0];
  const secrets = useMemo(() => unlockedFor(member), [member]);

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
  const [peek, setPeek] = useState<string | null>(null);
  const [wiggle, setWiggle] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  // ---- tap / hold combo
  const [combo, setCombo] = useState<{ sticker: Sticker; n: number } | null>(null);
  const comboRef = useRef<{ sticker: Sticker; n: number } | null>(null);
  const hold = useRef<{ timer: ReturnType<typeof setInterval>; start: number; base: number } | null>(null);
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
    setBursts((b) => [...b, { id, emoji: c.sticker.emoji, n: Math.min(28, 6 + Math.round(Math.log10(c.n) * 5)) }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400);
    bump(c.sticker.key, c.n);
    const r = await sendProps(podId, member.id, c.sticker.key, c.n);
    if (!r.ok) {
      bump(c.sticker.key, -c.n);
      show(r.error, { ok: false });
      return;
    }
    const m = milestone(c.n);
    show(`${c.n.toLocaleString()} × ${c.sticker.emoji} sent to ${first}${m && c.n >= 100 ? `. ${m.charAt(0).toUpperCase()}${m.slice(1)}.` : ""}`);
    router.refresh();
  }

  const scheduleFlush = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 900);
  };

  function press(sticker: Sticker) {
    if (comboRef.current && comboRef.current.sticker.key !== sticker.key) void flush();
    const base = comboRef.current?.n ?? 0;
    setN(sticker, base + 1);
    buzz(6);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    const start = clock();
    hold.current = {
      start,
      base,
      timer: setInterval(() => {
        const c = comboRef.current;
        if (c) setN(c.sticker, c.n + rampStep(clock() - start));
      }, 80),
    };
  }

  // The browser took the gesture (a scroll that began on a sticker): undo a quick press instead of sending it.
  function cancel() {
    const h = hold.current;
    if (!h) return;
    clearInterval(h.timer);
    hold.current = null;
    const c = comboRef.current;
    if (c && clock() - h.start < 350) {
      if (h.base === 0) {
        comboRef.current = null;
        setCombo(null);
        return;
      }
      comboRef.current = { ...c, n: h.base };
      setCombo(comboRef.current);
    }
    scheduleFlush();
  }

  function release() {
    if (!hold.current) return;
    clearInterval(hold.current.timer);
    const quick = clock() - hold.current.start < 350;
    hold.current = null;
    if (quick && ++taps.current === 4) setHint(true); // they're tapping a lot: whisper the secret
    if (!quick) setHint(false);
    scheduleFlush();
  }

  useEffect(
    () => () => {
      if (hold.current) clearInterval(hold.current.timer);
      if (flushTimer.current) clearTimeout(flushTimer.current);
    },
    [],
  );

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
      show("You can't heckle yourself. We checked.", { ok: false });
      return;
    }
    setOpen(true);
  }

  async function hide(key: string) {
    setPeek(null);
    const r = await hideProps(podId, key);
    if (!r.ok) return show(r.error, { ok: false });
    show(`${ALL_STICKERS[key].emoji} hidden. Nobody saw anything.`);
    router.refresh();
  }

  const stickerButton = (s: Sticker, big = false) => (
    <button
      key={s.key}
      type="button"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        press(s);
      }}
      onPointerUp={release}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex select-none touch-manipulation items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-90 ${
        combo?.sticker.key === s.key ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
      } ${big ? "col-span-2" : ""}`}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
    >
      <span className="text-2xl leading-none">{s.emoji}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{s.label}</span>
        {s.line && <span className="block text-xs text-white/55">{s.line}</span>}
      </span>
    </button>
  );

  return (
    <div className="relative mt-5 border-t border-white/[0.09] pt-4">
      {/* Received */}
      {shown.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
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
                  <span>{s.emoji}</span>
                  <span className="tabular-nums text-white/80">{fmt(t.total)}</span>
                </button>
                {peek === t.sticker && (
                  <span className="toast-in absolute bottom-full left-0 z-20 mb-2 w-56 rounded-2xl border border-white/10 bg-panel/95 p-3 text-xs text-white/70 shadow-2xl backdrop-blur-xl">
                    <span className="block text-sm font-medium text-white">
                      {s.emoji} {s.label}
                    </span>
                    {t.total.toLocaleString()} from {t.senders} {t.senders === 1 ? (t.from_me ? "person (you)" : "person") : "people"}
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

      <button
        key={wiggle}
        type="button"
        onClick={openSheet}
        className={`flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.09] ${wiggle ? "prop-wiggle" : ""}`}
      >
        <span aria-hidden>🐐</span> Send props
        {!member.is_me && secrets.length > 0 && <Sparkles size={14} className="text-amber-200/80" aria-label="Something's unlocked" />}
      </button>

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
              {b.emoji}
            </span>
          ))}
        </span>
      ))}

      {open && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px]" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-label={`Send props to ${first}`}
            className="toast-in fixed inset-x-0 bottom-0 z-[61] max-h-[85vh] overflow-y-auto rounded-t-[32px] border border-white/10 bg-panel/95 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[32px]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">To {first}</h3>
              <button onClick={close} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 hover:bg-white/[0.06]">
                <X size={18} />
              </button>
            </div>

            {/* The counter climbs while a sticker is held */}
            <div className="flex h-20 flex-col items-center justify-center">
              {combo ? (
                <>
                  <span key={milestone(combo.n) ?? "x"} className="success-pop text-3xl font-semibold tabular-nums">
                    {combo.sticker.emoji} ×{combo.n.toLocaleString()}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-amber-200/80">{milestone(combo.n) ?? " "}</span>
                </>
              ) : hint ? (
                <span className="row-in text-sm text-white/50">psst… try holding one down</span>
              ) : null}
            </div>

            {secrets.length > 0 && (
              <section className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-amber-200/80">
                  <Sparkles size={13} /> Unlocked by {first}&apos;s numbers
                </p>
                <div className="grid grid-cols-2 gap-2">{secrets.map((s) => stickerButton(s, true))}</div>
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
        </>
      )}
      {toast}
    </div>
  );
}
