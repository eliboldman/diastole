"use client";

import { HeartPulse, Pause, Play, Vibrate, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useHeartRate } from "@/components/breath/useHeartRate";
import { saveBreath } from "@/lib/breath/actions";
import { breathSwing, summarise, type HrPacket, type HrSample } from "@/lib/breath/hr";
import { cycle, FINDER_PACES, FINDER_STEP_SECONDS, PHASE_WORDS, type Kind, type Phase, type PhaseKind, type SessionInfo } from "@/lib/breath/plan";
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
export default function BreathPlayer({ info, minutes, pace, backHref }: { info: SessionInfo; minutes: number[]; pace: number; backHref: string }) {
  const router = useRouter();
  const { kind, title } = info;
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

  // Live heart rate (optional): samples per segment for the finder's swings, and across the whole session.
  const recording = useRef(false);
  const segIndex = useRef(0);
  const segSamples = useRef<HrSample[]>([]);
  const allSamples = useRef<HrSample[]>([]);
  const beats = useRef<number[]>([]);
  const swings = useRef<Record<string, number>>({});
  const [firstBpm, setFirstBpm] = useState<number | null>(null);
  const [hrSum, setHrSum] = useState<ReturnType<typeof summarise>>(null);
  const onPacket = useCallback((p: HrPacket) => {
    if (!recording.current || p.bpm == null) return;
    const t = (performance.now() - startedAt.current) / 1000;
    segSamples.current.push({ t, bpm: p.bpm });
    allSamples.current.push({ t: spent.current + t, bpm: p.bpm });
    setFirstBpm((f) => f ?? p.bpm);
    beats.current.push(...p.rr);
  }, []);
  const hr = useHeartRate(onPacket);
  const finishHr = useCallback(() => {
    recording.current = false;
    const cyc = cycle(kind, pace, 0.5).reduce((a, x) => a + x.seconds, 0);
    setHrSum(summarise(allSamples.current, beats.current, cyc));
  }, [kind, pace]);

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
      segIndex.current = i;
      segSamples.current = [];
      recording.current = true;
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
        recording.current = false;
        if (finder) {
          const p = FINDER_PACES[segIndex.current];
          const sw = breathSwing(segSamples.current, 60 / p, 20);
          if (sw != null) swings.current[String(p)] = sw;
        }
        spent.current += total;
        if (finder) setStage("rate");
        else {
          finishHr();
          setStage("after");
        }
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
  }, [stage, paused, finder, tone, finishHr]);

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
      recording.current = true;
      setPaused(false);
    } else {
      recording.current = false;
      pausedAt.current = performance.now();
      setPaused(true);
    }
  };

  const endEarly = () => {
    const t = pausedAt.current ?? performance.now();
    spent.current += Math.min(plan.current.total, (t - startedAt.current) / 1000);
    setPaused(false);
    finishHr();
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
    else {
      finishHr();
      setStage("after");
    }
  };

  const save = async () => {
    setSaving(true);
    const r = await saveBreath({
      kind,
      seconds: spent.current,
      pace: finder ? null : pace,
      calmBefore,
      calmAfter,
      ratings: finder ? ratings : null,
      hr: hrSum ? { start: hrSum.start, end: hrSum.end, swing: finder ? null : hrSum.swing, rmssd: hrSum.rmssd, swings: finder ? swings.current : null, device: hr.device } : null,
    });
    setSaving(false);
    if (r.ok) {
      const byHr = finder && Object.keys(swings.current).length >= 4;
      setResult({
        ok: true,
        text: finder && r.pace
          ? `Your pace is ${r.pace} breaths a minute${byHr ? `, where your heart rate swung the most (${swings.current[String(r.pace)]} bpm per breath)` : ""}. Recovery breathing will use it from now on.`
          : "Saved.",
      });
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
            <p className="mt-3 text-white/75">{info.why}</p>
            {!finder && kind === "resonance" && <p className="mt-3 text-sm text-emerald-200/80">{`Your pace: ${pace} breaths a minute.`}</p>}
            <p className="mt-4 text-xs uppercase tracking-[0.15em] text-white/50">When to use it</p>
            <p className="mt-1 text-sm text-white/70">{info.when}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.15em] text-white/50">How</p>
            <ol className="mt-1 grid gap-1.5 text-sm text-white/70">
              {info.how.map((h, i) => (
                <li key={h} className="flex gap-2">
                  <span className="tabular-nums text-white/40">{`${i + 1}.`}</span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
            <details className="mt-4 rounded-2xl border border-white/[0.08] px-4 py-3 text-sm text-white/65">
              <summary className="cursor-pointer font-medium text-white/80">How it works and the evidence</summary>
              <p className="mt-2">{info.works}</p>
              <p className="mt-2 text-white/55">{info.evidence}</p>
            </details>

            <HeartPanel hr={hr} finder={finder} />

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
                {hr.status === "live" && hr.bpm != null && (
                  <span className="mt-2 flex items-center justify-center gap-1 text-sm tabular-nums text-rose-200/90">
                    <HeartPulse size={14} aria-hidden /> {hr.bpm}
                    {firstBpm != null && hr.bpm !== firstBpm ? <span className="text-white/45">{` (${hr.bpm - firstBpm > 0 ? "+" : ""}${hr.bpm - firstBpm})`}</span> : null}
                  </span>
                )}
                {hr.status === "lost" && <span className="mt-2 block text-xs text-amber-200/80">Heart rate lost</span>}
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
            {hrSum && (hrSum.start != null || hrSum.swing != null) && (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4 text-sm text-white/80">
                <p className="flex items-center gap-1.5 font-medium text-rose-100"><HeartPulse size={15} aria-hidden /> Your heart rate</p>
                {hrSum.start != null && hrSum.end != null && <p className="mt-1">{`${hrSum.start} → ${hrSum.end} bpm, first minute vs last${hrSum.end < hrSum.start ? ` (down ${hrSum.start - hrSum.end})` : ""}.`}</p>}
                {!finder && hrSum.swing != null && <p className="mt-1">{`It rose and fell about ${hrSum.swing} bpm with each breath. A bigger swing means your breathing and heart were in sync.`}</p>}
                {hrSum.rmssd != null && <p className="mt-1">{`HRV (RMSSD) during the session: ${hrSum.rmssd} ms.`}</p>}
              </div>
            )}
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

/** Connect a heart-rate sensor before starting: a Garmin watch broadcasting, or a chest strap. */
function HeartPanel({ hr, finder }: { hr: ReturnType<typeof useHeartRate>; finder: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <p className="flex items-center gap-1.5 font-medium"><HeartPulse size={16} className="text-rose-300" aria-hidden /> Live heart rate <span className="text-xs font-normal text-white/45">optional</span></p>
      <p className="mt-1 text-sm text-white/60">
        {finder
          ? "With a sensor connected, Diastole picks your pace from how much your heart rate swings at each pace, not just how it felt."
          : "See your heart rate settle as you breathe, and how much it swings with each breath."}
      </p>
      {hr.source ? (
        <div className="mt-3">
          {hr.status === "live" ? (
            <p className="text-sm text-rose-100">{`${hr.device ?? "Sensor"} connected · ${hr.bpm ?? "–"} bpm`}</p>
          ) : (
            <button type="button" onClick={hr.connect} disabled={hr.status === "connecting"} className="min-h-11 rounded-2xl border border-rose-300/40 bg-rose-300/10 px-4 text-sm font-medium text-rose-100 active:scale-95 disabled:opacity-60">
              {hr.status === "connecting" ? "Looking for your sensor…" : hr.status === "lost" ? "Reconnect heart rate" : "Connect heart rate"}
            </button>
          )}
          {hr.error && <p className="mt-2 text-xs text-amber-200/80">{hr.error}</p>}
        </div>
      ) : (
        <p className="mt-3 text-xs text-white/50">
          {!hr.checked ? null : hr.inApp
            ? "Live heart rate in the iPhone app is coming in the next app update. For now it works in Chrome on Android or on a computer."
            : "This browser can't connect to Bluetooth sensors. Open Diastole in Chrome (Android or computer) to use it."}
        </p>
      )}
      <details className="mt-3 text-xs text-white/55">
        <summary className="cursor-pointer text-white/70">Using a Garmin watch?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>On the watch, open the heart rate widget or the controls menu and choose Broadcast Heart Rate. (On some models: Settings › Sensors › Wrist Heart Rate › Broadcast.)</li>
          <li>Keep the watch on the wrist, snug. Then tap Connect heart rate here and pick your watch from the list.</li>
          <li>Older watches broadcast only over ANT+, which phones can&apos;t read. If yours doesn&apos;t show up, a chest strap (HRM-Pro, HRM 200/600) works and also sends beat-to-beat data for a real HRV number.</li>
          <li>Wrist broadcasts usually send heart rate only, so you get settling and swing but not HRV. Turn broadcasting off after, as it uses battery.</li>
        </ol>
      </details>
    </div>
  );
}
