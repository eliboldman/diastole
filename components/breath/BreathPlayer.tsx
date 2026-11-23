"use client";

import { Pause, Play, Vibrate, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { saveBreath } from "@/lib/breath/actions";
import { cycle, FINDER_PACES, FINDER_STEP_SECONDS, PHASE_WORDS, type Kind, type Phase, type PhaseKind } from "@/lib/breath/plan";
import { haptic } from "@/lib/haptics";

type Timed = Phase & { at: number }; // seconds from the start of the segment
type Stage = "intro" | "play" | "rate" | "after" | "done";

const PREFS = "diastole.breath.prefs";
const CALM = ["Wired", "Tense", "OK", "Calm", "Very calm"];
const SCALE: Record<PhaseKind, number | null> = { in: 1, top: 1.12, out: 0.55, hold: null, rest: null };

/** Lay out a segment's breaths, ending on a whole breath. */
function timeline(kind: Kind, pace: number, seconds: number): { phases: Timed[]; total: number } {
  const phases: Timed[] = [];
  let t = 0;
  while (t < seconds - 1) {
    for (const p of cycle(kind, pace, t / seconds)) {
      phases.push({ ...p, at: t });
      t += p.seconds;
    }
  }
  return { phases, total: t };
}

/** A guided breathing session. Eyes can stay closed: soft tones and a buzz (on the iPhone app) mark each breath. */
export default function BreathPlayer({ kind, title, why, minutes, pace, backHref }: { kind: Kind; title: string; why: string; minutes: number[]; pace: number; backHref: string }) {
  const router = useRouter();
  const finder = kind === "finder";
  const [stage, setStage] = useState<Stage>("intro");
  const [length, setLength] = useState(minutes[0]);
  const [calmBefore, setCalmBefore] = useState<number | null>(null);
  const [calmAfter, setCalmAfter] = useState<number | null>(null);
  const [tones, setTones] = useState(true);
  const [buzz, setBuzz] = useState(true);
  const [segment, setSegment] = useState(0);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<Timed | null>(null);
  const [left, setLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const audio = useRef<AudioContext | null>(null);
  const plan = useRef<{ phases: Timed[]; total: number }>({ phases: [], total: 0 });
  const startedAt = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const spent = useRef(0); // seconds breathed in finished segments
  const lastIndex = useRef(-1);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const prefs = useRef({ tones, buzz });
  useEffect(() => {
    prefs.current = { tones, buzz };
  }, [tones, buzz]);
  const [orb, setOrb] = useState(0.55);

  // Remember sound and buzz choices on this device.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { tones?: boolean; buzz?: boolean };
      setTimeout(() => {
        if (typeof p.tones === "boolean") setTones(p.tones);
        if (typeof p.buzz === "boolean") setBuzz(p.buzz);
      }, 0);
    } catch {
      /* private mode */
    }
  }, []);
  const savePrefs = (next: { tones: boolean; buzz: boolean }) => {
    try {
      localStorage.setItem(PREFS, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  const segPace = finder ? FINDER_PACES[segment] : pace;

  const tone = useCallback((p: Phase) => {
    const ctx = audio.current;
    if (!ctx || !prefs.current.tones || (p.kind !== "in" && p.kind !== "out" && p.kind !== "top")) return;
    const now = ctx.currentTime;
    const dur = Math.max(0.6, p.seconds);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    const [from, to] = p.kind === "in" ? [196, 262] : p.kind === "top" ? [262, 294] : [262, 175];
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.linearRampToValueAtTime(to, now + dur);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05, now + Math.min(0.8, dur / 3));
    gain.gain.linearRampToValueAtTime(0, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }, []);

  const beginSegment = useCallback(
    (i: number) => {
      const seconds = finder ? FINDER_STEP_SECONDS : length * 60;
      plan.current = timeline(kind, finder ? FINDER_PACES[i] : pace, seconds);
      lastIndex.current = -1;
      startedAt.current = performance.now();
      pausedAt.current = null;
      setPaused(false);
      setSegment(i);
      setStage("play");
    },
    [finder, kind, length, pace],
  );

  // The clock: one frame loop reads the time and moves to the next phase when it's due.
  useEffect(() => {
    if (stage !== "play" || paused) return;
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - startedAt.current) / 1000;
      const { phases, total } = plan.current;
      if (t >= total) {
        spent.current += total;
        if (finder) setStage("rate");
        else setStage("after");
        return;
      }
      let i = lastIndex.current < 0 ? 0 : lastIndex.current;
      while (i + 1 < phases.length && phases[i + 1].at <= t) i++;
      if (i !== lastIndex.current) {
        lastIndex.current = i;
        const p = phases[i];
        setPhase(p);
        const sc = SCALE[p.kind];
        if (sc != null) setOrb(sc);
        tone(p);
        if (prefs.current.buzz && (p.kind === "in" || p.kind === "out")) haptic(p.kind === "in" ? "light" : "rigid");
      }
      setLeft(Math.ceil(total - t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, paused, finder, tone]);

  // Keep the screen on while breathing.
  useEffect(() => {
    if (stage !== "play") return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((w) => (wake.current = w), () => {});
    return () => {
      wake.current?.release().catch(() => {});
      wake.current = null;
    };
  }, [stage]);

  useEffect(() => () => void audio.current?.close().catch(() => {}), []);

  const start = () => {
    // Sound has to start from a tap on iPhone.
    if (!audio.current) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        audio.current = Ctx ? new Ctx() : null;
      } catch {
        audio.current = null;
      }
    }
    void audio.current?.resume().catch(() => {});
    spent.current = 0;
    beginSegment(0);
  };

  const togglePause = () => {
    if (paused) {
      if (pausedAt.current != null) startedAt.current += performance.now() - pausedAt.current;
      pausedAt.current = null;
      lastIndex.current = Math.max(-1, lastIndex.current - 1); // replay the current phase's cue
      setPaused(false);
    } else {
      pausedAt.current = performance.now();
      setPaused(true);
    }
  };

  const endEarly = () => {
    const t = pausedAt.current ?? performance.now();
    spent.current += Math.min(plan.current.total, (t - startedAt.current) / 1000);
    setPaused(false);
    if (finder) {
      if (Object.keys(ratings).length) setStage("after");
      else router.push(backHref);
    } else if (spent.current >= 60) setStage("after");
    else router.push(backHref);
  };

  const rate = (v: number) => {
    const next = { ...ratings, [String(FINDER_PACES[segment])]: v };
    setRatings(next);
    if (segment + 1 < FINDER_PACES.length) beginSegment(segment + 1);
    else setStage("after");
  };

  const save = async () => {
    setSaving(true);
    const r = await saveBreath({ kind, seconds: spent.current, pace: finder ? null : pace, calmBefore, calmAfter, ratings: finder ? ratings : null });
    setSaving(false);
    if (r.ok) {
      setResult({ ok: true, text: finder && r.pace ? `Your pace is ${r.pace} breaths a minute. Recovery breathing will use it from now on.` : "Saved." });
      haptic("success");
    } else setResult({ ok: false, text: r.error });
    setStage("done");
    router.refresh();
  };

  const mins = Math.floor(left / 60);
  const secs = String(left % 60).padStart(2, "0");

  const chip = (on: boolean) =>
    `min-h-11 rounded-2xl border px-4 text-sm font-medium transition active:scale-95 ${on ? "border-emerald-300/60 bg-emerald-300/15 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/70"}`;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-canvas pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-14 items-center gap-2 px-3">
        <button type="button" onClick={() => router.push(backHref)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.06]">
          <X size={20} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={() => {
            setTones(!tones);
            savePrefs({ tones: !tones, buzz });
          }}
          aria-label={tones ? "Turn tones off" : "Turn tones on"}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.06]"
        >
          {tones ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-6">
        {stage === "intro" && (
          <div className="row-in flex flex-1 flex-col">
            <h1 className="mt-4 text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-3 text-white/65">{why}</p>
            {!finder && kind === "resonance" && <p className="mt-3 text-sm text-emerald-200/80">{`Your pace: ${pace} breaths a minute.`}</p>}

            {!finder && minutes.length > 1 && (
              <div className="mt-6">
                <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/50">Length</p>
                <div className="flex flex-wrap gap-2">
                  {[...minutes].sort((a, b) => a - b).map((m) => (
                    <button key={m} type="button" onClick={() => setLength(m)} className={chip(length === m)}>{`${m} min`}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-[0.15em] text-white/50">How do you feel right now?</p>
              <div className="flex flex-wrap gap-2">
                {CALM.map((c, i) => (
                  <button key={c} type="button" onClick={() => setCalmBefore(calmBefore === i + 1 ? null : i + 1)} className={chip(calmBefore === i + 1)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setBuzz(!buzz); savePrefs({ tones, buzz: !buzz }); }} className={chip(buzz)}>
                <Vibrate size={15} className="mr-1.5 inline" aria-hidden />
                {buzz ? "Buzz on each breath" : "No buzz"}
              </button>
              <button type="button" onClick={() => { setTones(!tones); savePrefs({ tones: !tones, buzz }); }} className={chip(tones)}>
                {tones ? <Volume2 size={15} className="mr-1.5 inline" aria-hidden /> : <VolumeX size={15} className="mr-1.5 inline" aria-hidden />}
                {tones ? "Soft tones" : "Silent"}
              </button>
            </div>
            <p className="mt-3 text-sm text-white/50">Breathe through your nose if you can. Tones rise as you breathe in and fall as you breathe out, so you can close your eyes. If you feel light-headed, breathe normally.</p>

            <button type="button" onClick={start} className="mt-auto inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-6 text-lg font-semibold text-emerald-950 active:scale-95">
              <Play size={18} aria-hidden /> Start
            </button>
          </div>
        )}

        {stage === "play" && (
          <div className="flex flex-1 flex-col items-center justify-center">
            {finder && <p className="mb-6 text-sm text-white/60">{`Pace ${segment + 1} of ${FINDER_PACES.length}: ${segPace} breaths a minute`}</p>}
            <button type="button" onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} className="relative flex h-72 w-72 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-300/50 to-sky-400/30 shadow-[0_0_80px_rgba(110,231,183,0.25)]"
                style={{ transform: `scale(${orb})`, transition: phase && !paused ? `transform ${phase.seconds}s cubic-bezier(.45,0,.55,1)` : "none" }}
              />
              <span className="relative text-center">
                <span className="block text-2xl font-semibold text-white" aria-live="polite">{paused ? "Paused" : phase ? PHASE_WORDS[phase.kind] : ""}</span>
                <span className="mt-1 block text-sm tabular-nums text-white/60">{`${mins}:${secs}`}</span>
              </span>
            </button>
            <div className="mt-10 flex gap-3">
              <button type="button" onClick={togglePause} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-medium">
                {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />} {paused ? "Resume" : "Pause"}
              </button>
              <button type="button" onClick={endEarly} className="min-h-12 rounded-2xl border border-white/10 px-5 font-medium text-white/70">
                End
              </button>
            </div>
          </div>
        )}

        {stage === "rate" && (
          <div className="row-in flex flex-1 flex-col justify-center">
            <p className="text-sm text-white/55">{`${segPace} breaths a minute`}</p>
            <h2 className="mt-1 text-2xl font-semibold">How easy and calming was that pace?</h2>
            <div className="mt-6 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} type="button" onClick={() => rate(v)} className="min-h-14 rounded-2xl border border-white/10 bg-white/[0.05] text-lg font-semibold active:scale-95">{v}</button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-white/50"><span>Hard work</span><span>Easy, calming</span></div>
          </div>
        )}

        {stage === "after" && (
          <div className="row-in flex flex-1 flex-col justify-center">
            <h2 className="text-2xl font-semibold">{finder ? "Nice. One last question" : "Done. How do you feel now?"}</h2>
            {finder && <p className="mt-2 text-white/60">How do you feel now?</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              {CALM.map((c, i) => (
                <button key={c} type="button" onClick={() => setCalmAfter(calmAfter === i + 1 ? null : i + 1)} className={chip(calmAfter === i + 1)}>{c}</button>
              ))}
            </div>
            <button type="button" disabled={saving} onClick={save} className="mt-8 min-h-14 rounded-2xl bg-emerald-300 px-6 text-lg font-semibold text-emerald-950 active:scale-95 disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {stage === "done" && result && (
          <div className="row-in flex flex-1 flex-col justify-center">
            <h2 className="text-2xl font-semibold">{result.ok ? "Logged" : "Couldn't save"}</h2>
            <p className="mt-2 text-white/65">{result.text}</p>
            <Link href={backHref} className="mt-8 inline-flex min-h-14 items-center justify-center rounded-2xl bg-white/[0.08] px-6 font-semibold">
              Back to Breathe
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
