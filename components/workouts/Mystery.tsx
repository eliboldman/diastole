"use client";

import { Eye, Gift, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type CSSProperties } from "react";

import { haptic } from "@/lib/haptics";
import { revealMystery, setMystery } from "@/lib/workouts/mystery-actions";

/** A sealed envelope with a green wax heart (Diastole's own). Opens when `open`. */
function Envelope({ open = false, size = 96 }: { open?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 120 96" width={size} height={(size * 96) / 120} aria-hidden className="shrink-0 overflow-visible">
      <rect x="8" y="24" width="104" height="66" rx="10" fill="#1f2b27" stroke="rgba(255,255,255,.18)" />
      {open && <rect x="22" y="6" width="76" height="60" rx="6" fill="#ecfdf5" className="mystery-letter" />}
      <path d="M8 34l52 34 52-34v50a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill="#24332e" />
      <path d={open ? "M8 30L60 2l52 28" : "M8 30l52 34 52-34"} fill={open ? "#2a3b35" : "#2f413a"} stroke="rgba(255,255,255,.18)" style={{ transition: "d 500ms" }} />
      {!open && (
        <g transform="translate(60 58)">
          <circle r="12" fill="var(--color-emerald-400)" />
          <path d="M0 6s-6-3.6-6-7.6A3.4 3.4 0 0 1 0-3.6a3.4 3.4 0 0 1 6 2.2C6 2.4 0 6 0 6z" fill="var(--color-emerald-950)" />
        </g>
      )}
    </svg>
  );
}

/**
 * Athlete, before the workout: only sport, time and gear (shown by the page). Steps can come out one
 * at a time as they go, and everything can be revealed early: safety beats surprise.
 */
export function SealedWorkout({ workoutId, minutes, steps, note }: { workoutId: string; minutes: number | null; steps: string[]; note: boolean }) {
  const router = useRouter();
  const key = `diastole:mystery:${workoutId}`;
  // Steps already revealed on this device (read once, lazily, so there's no flash on load).
  const [shown, setShown] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      return Math.min(Number(localStorage.getItem(key) ?? 0) || 0, steps.length);
    } catch {
      return 0;
    }
  });
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const next = () => {
    const n = Math.min(steps.length, shown + 1);
    setShown(n);
    haptic("light");
    try {
      localStorage.setItem(key, String(n));
    } catch {}
  };
  const all = () =>
    start(async () => {
      const r = await revealMystery(workoutId);
      if (r.ok) router.refresh();
    });

  return (
    <section className="row-in mt-6 rounded-[28px] border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.08] to-white/[0.02] p-5" aria-label="Mystery workout">
      <div className="flex items-center gap-4">
        <Envelope />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-emerald-200/80">
            <Gift size={13} aria-hidden /> Sealed by your coach
          </p>
          <p className="mt-1 text-lg font-medium">{minutes ? `About ${minutes} minutes` : "A surprise session"}</p>
          <p className="text-sm text-white/60">The steps reveal one at a time. It unseals when you finish{note ? ", with a note from your coach" : ""}.</p>
        </div>
      </div>

      {shown > 0 && (
        <ol className="mt-4 grid gap-1.5">
          {steps.slice(0, shown).map((l, i) => (
            <li key={i} className={`rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/85 ${i === shown - 1 ? "success-pop" : ""}`}>
              <span className="mr-2 text-white/45">{i + 1}.</span>
              {l}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {shown < steps.length ? (
          <button type="button" onClick={next} className="flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-95">
            <Sparkles size={15} aria-hidden /> {shown === 0 ? "Reveal the first step" : "Next step"}
          </button>
        ) : (
          <p className="text-sm text-emerald-100/90">That&apos;s every step. Finish it to unseal the rest.</p>
        )}
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 px-4 text-sm text-white/70 hover:bg-white/[0.06]">
            <Eye size={15} aria-hidden /> Reveal everything
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-white/65">Open it all now?</span>
            <button type="button" disabled={pending} onClick={all} className="min-h-11 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-emerald-50">
              Yes, show me
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="min-h-11 px-3 text-white/55">
              Keep it sealed
            </button>
          </span>
        )}
      </div>
      <p className="mt-3 text-xs text-white/45">Need to plan around it, or not feeling right? Reveal everything any time. Your watch shows each step as it starts.</p>
    </section>
  );
}

/** After it's done: the envelope opens (once per device), with the coach's note. */
export function MysteryRevealed({ workoutId, note }: { workoutId: string; note: string | null }) {
  const key = `diastole:mystery-open:${workoutId}`;
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    const t = setTimeout(() => {
      setAnimate(true);
      haptic("success");
    }, 300);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <section className={`row-in mt-6 overflow-hidden rounded-[28px] border border-emerald-300/25 bg-gradient-to-br from-emerald-300/[0.10] to-white/[0.02] p-5 ${animate ? "mystery-open" : ""}`} aria-label="Mystery revealed">
      <div className="flex items-center gap-4">
        <Envelope open size={84} />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-emerald-200/80">Mystery unsealed</p>
          <p className="mt-1 text-lg font-medium">Here&apos;s what you just did</p>
          {note ? <p className="mt-1 text-[15px] leading-relaxed text-white/85">&ldquo;{note}&rdquo; <span className="text-sm text-white/50">— your coach</span></p> : <p className="text-sm text-white/60">The full workout is below.</p>}
        </div>
      </div>
      {animate && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="grit-shard absolute left-16 top-12 h-2 w-2 rounded-full" style={{ background: ["var(--color-emerald-300)", "#fde68a", "#f9a8d4"][i % 3], "--dx": `${Math.round(Math.cos(i) * 90)}px`, "--dy": `${Math.round(Math.sin(i * 1.7) * 60 - 20)}px`, "--r": "0deg", animationDelay: `${i * 25}ms` } as CSSProperties} />
          ))}
        </span>
      )}
    </section>
  );
}

/** Coach, on the workout page: seal it, and leave a note for the reveal. */
export function MysteryToggle({ workoutId, on, note, sent }: { workoutId: string; on: boolean; note: string | null; sent: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [text, setText] = useState(note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (next: boolean) =>
    start(async () => {
      const r = await setMystery(workoutId, next, text);
      setMsg(r.ok ? (next ? "Sealed." : "Not a mystery.") : r.error);
      if (r.ok) router.refresh();
    });
  return (
    <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-5 sm:p-6">
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={value} disabled={pending} onChange={(e) => { setValue(e.target.checked); save(e.target.checked); }} className="h-5 w-5 accent-[var(--color-emerald-300)]" />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Gift size={16} className="text-emerald-200" aria-hidden /> Send as a mystery
          </span>
          <span className="block text-sm text-white/55">They see only the sport, about how long, and what to pack. Steps reveal one at a time; it all unseals when they finish. They can always reveal it early.</span>
        </span>
      </label>
      {value && (
        <div className="mt-3">
          <label className="block">
            <span className="mb-1 block text-xs text-white/50">Your note for the reveal (optional)</span>
            <textarea value={text} maxLength={300} rows={2} onChange={(e) => setText(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-white focus:border-emerald-300/40 focus:outline-none" />
          </label>
          <button type="button" disabled={pending} onClick={() => save(true)} className="mt-2 min-h-11 rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-4 text-sm text-emerald-50">
            Save note
          </button>
          {sent && <p className="mt-2 text-xs text-amber-100/80">Already on their watch under its real name. Seal before sending next time so the watch shows &ldquo;Mystery&rdquo; too.</p>}
        </div>
      )}
      {msg && <p role="status" className="mt-2 text-sm text-white/65">{msg}</p>}
    </section>
  );
}
