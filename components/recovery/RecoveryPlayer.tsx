"use client";

import { Check, ChevronLeft, Pause, Play, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { finishSession } from "@/lib/recovery/actions";
import { minutesLabel, moveBySlug, routineSeconds, type Move, type RoutineItem } from "@/lib/recovery/catalog";

/** Media for a move: the coach's clip today; an avatar animation can be dropped in per move later. */
export type MoveMedia = Record<string, { video: string; poster: string | null }>;

type Segment =
  | { kind: "move"; move: Move; seconds: number; side: "left" | "right" | null; mirror: boolean }
  | { kind: "switch"; move: Move; seconds: number };

const SWITCH_SECONDS = 5;
const VOICE_KEY = "d_recovery_voice";

function segmentsOf(items: RoutineItem[]): Segment[] {
  const out: Segment[] = [];
  for (const i of items) {
    const move = moveBySlug(i.slug);
    if (!move) continue;
    if (move.perSide) {
      out.push({ kind: "move", move, seconds: i.seconds, side: "left", mirror: false });
      out.push({ kind: "switch", move, seconds: SWITCH_SECONDS });
      // The other side: the same clip, mirrored.
      out.push({ kind: "move", move, seconds: i.seconds, side: "right", mirror: true });
    } else out.push({ kind: "move", move, seconds: i.seconds, side: null, mirror: false });
  }
  return out;
}

// Spoken cues: the phone's voice for now. To use the coach's recorded clips later, swap this for an
// <audio> player keyed by the same phrases.
function speak(text: string, on: boolean) {
  if (!on || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    window.speechSynthesis.speak(u);
  } catch {
    /* no voice available */
  }
}

const BOX = ["Breathe in", "Hold", "Breathe out", "Hold"];
const dur = (s: number) => (s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export default function RecoveryPlayer({
  title,
  items,
  media,
  assignmentId,
  source,
  backHref,
}: {
  title: string;
  items: RoutineItem[];
  media: MoveMedia;
  assignmentId: string | null;
  source: "assigned" | "suggested" | "self";
  backHref: string;
}) {
  const router = useRouter();
  const segments = useMemo(() => segmentsOf(items), [items]);
  const total = routineSeconds(items);
  const [stage, setStage] = useState<"start" | "play" | "done">("start");
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(segments[0]?.seconds ?? 0);
  const [paused, setPaused] = useState(false);
  const [voice, setVoice] = useState(true);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [elapsed, setElapsed] = useState(0);
  const shown = useRef(-1);
  const endAt = useRef(0);
  const spent = useRef(0);
  const lastSpoken = useRef("");
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_KEY);
      if (v === "off") setTimeout(() => setVoice(false), 0);
    } catch {
      /* private mode */
    }
  }, []);

  const seg = segments[index];
  const next = segments.slice(index + 1).find((s) => s.kind === "move");
  const nextLabel = next?.kind === "move" ? (seg?.move.slug === next.move.slug && next.side ? `${next.side} side` : next.move.name) : null;

  const announce = useCallback(
    (s: Segment | undefined) => {
      if (!s) return;
      if (s.kind === "switch") speak("Switch sides", voice);
      else speak(`${s.move.name}${s.side ? `, ${s.side} side` : ""}. ${s.move.pattern ? "" : `${s.seconds} seconds.`}`, voice);
    },
    [voice],
  );

  const goTo = useCallback(
    (i: number) => {
      if (i >= segments.length) {
        setElapsed(Math.max(spent.current, 30));
        setStage("done");
        speak("Nice work. All done.", voice);
        return;
      }
      const s = segments[Math.max(0, i)];
      setIndex(Math.max(0, i));
      setLeft(s.seconds);
      endAt.current = Date.now() + s.seconds * 1000;
      announce(s);
    },
    [segments, announce, voice],
  );

  // The clock: based on an end time so it stays right if the phone stutters.
  useEffect(() => {
    if (stage !== "play" || paused) return;
    const t = setInterval(() => {
      const rest = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      if (shown.current !== rest) {
        if (shown.current !== -1) spent.current += 1;
        shown.current = rest;
      }
      setLeft(rest);
      if (rest <= 0) goTo(index + 1);
    }, 250);
    return () => clearInterval(t);
  }, [stage, paused, index, goTo]);

  // Box breathing: say each phase every 4 seconds.
  const boxPhase = seg?.kind === "move" && seg.move.pattern === "box" ? Math.floor((seg.seconds - left) / 4) % 4 : -1;
  useEffect(() => {
    if (stage !== "play" || paused || boxPhase < 0) return;
    const key = `${index}:${seg.seconds - left - ((seg.seconds - left) % 4)}`;
    if (lastSpoken.current === key) return;
    lastSpoken.current = key;
    speak(BOX[boxPhase], voice);
  }, [boxPhase, index, left, paused, seg, stage, voice]);

  // Keep the screen on while playing.
  useEffect(() => {
    if (stage !== "play") return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then((w) => (wake.current = w), () => {});
    return () => {
      wake.current?.release().catch(() => {});
      wake.current = null;
    };
  }, [stage]);

  // Closing mid-way stops any speech.
  useEffect(() => () => void (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.cancel()), []);

  const start = () => {
    setStage("play");
    goTo(0);
  };
  const togglePause = () => {
    if (paused) {
      endAt.current = Date.now() + left * 1000;
      setPaused(false);
    } else {
      setPaused(true);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  };
  const toggleVoice = () => {
    const v = !voice;
    setVoice(v);
    try {
      localStorage.setItem(VOICE_KEY, v ? "on" : "off");
    } catch {
      /* private mode */
    }
    if (!v && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };
  const finish = async () => {
    setSaved("saving");
    const r = await finishSession({ title, seconds: elapsed, assignmentId, source });
    setSaved(r.ok ? "saved" : "error");
    router.push(backHref);
    router.refresh();
  };

  const clip = seg?.kind === "move" || seg?.kind === "switch" ? media[seg.move.slug] : undefined;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-canvas pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <div className="flex h-14 items-center gap-2 px-3">
        <button type="button" onClick={() => router.push(backHref)} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.06]">
          <X size={20} />
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">{title}</p>
        <button type="button" onClick={toggleVoice} aria-label={voice ? "Turn voice off" : "Turn voice on"} aria-pressed={voice} className="flex h-11 w-11 items-center justify-center rounded-xl text-white/70 hover:bg-white/[0.06]">
          {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
      </div>

      {stage === "start" && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-6">
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-emerald-200/70">Recovery · {minutesLabel(total)}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
          <ul className="mt-6 space-y-2">
            {items.map((i, k) => {
              const m = moveBySlug(i.slug)!;
              return (
                <li key={k} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{m.name}</span>
                    {m.equipment !== "none" && <span className="text-xs text-white/45">{m.equipment}</span>}
                  </span>
                  <span className="shrink-0 text-white/55 tabular-nums">{m.perSide ? `${dur(i.seconds)} each side` : dur(i.seconds)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-white/40">General recovery guidance, not medical treatment. Ease off anything that hurts.</p>
          <button type="button" onClick={start} className="mt-auto flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-300 text-lg font-medium text-black transition active:scale-[0.98]">
            <Play size={20} /> Start
          </button>
        </div>
      )}

      {stage === "play" && seg && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-4">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-300 transition-all" style={{ width: `${((index + 1) / segments.length) * 100}%` }} />
          </div>
          <div className="relative mt-4 min-h-[140px] w-full flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03] sm:max-h-[50vh]">
            {seg.kind === "move" && seg.move.pattern === "box" ? (
              <div className="flex h-full items-center justify-center">
                <div
                  className="flex h-40 w-40 items-center justify-center rounded-[28px] border-2 border-emerald-300/70 transition-transform duration-[4000ms] ease-in-out"
                  style={{ transform: boxPhase === 0 ? "scale(1.15)" : boxPhase === 2 ? "scale(0.85)" : undefined }}
                >
                  <span className="text-lg font-medium text-emerald-100">{BOX[Math.max(0, boxPhase)]}</span>
                </div>
              </div>
            ) : clip ? (
              <video
                key={`${seg.move.slug}-${seg.kind === "move" && seg.mirror}`}
                src={clip.video}
                poster={clip.poster ?? undefined}
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
                style={seg.kind === "move" && seg.mirror ? { transform: "scaleX(-1)" } : undefined}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-emerald-300/10 to-transparent p-6 text-center">
                <p className="text-lg font-medium">{seg.move.name}</p>
                <p className="mt-2 text-sm text-white/55">{seg.move.equipment === "none" ? "No equipment" : seg.move.equipment}</p>
              </div>
            )}
            {seg.kind === "switch" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
                <p className="text-2xl font-semibold">Switch sides</p>
              </div>
            )}
          </div>

          <div className="mt-4 text-center">
            <p className="text-6xl font-semibold tabular-nums tracking-tight sm:text-7xl" aria-live="off">
              {Math.floor(left / 60) > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : left}
            </p>
            {seg.kind === "move" && seg.side && <p className="mt-1 text-sm uppercase tracking-[0.2em] text-emerald-200/80">{seg.side} side</p>}
          </div>

          <div className="mt-3 shrink-0 rounded-2xl bg-white/[0.04] p-4">
            <p className="font-medium">{seg.move.name}</p>
            <p className="mt-1 text-sm text-white/65">{seg.move.cue}</p>
          </div>
          {nextLabel && <p className="mt-2 text-center text-xs text-white/45">Next: {nextLabel}</p>}

          <div className="flex shrink-0 items-center justify-center gap-6 pt-4">
            <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous" className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] disabled:opacity-30">
              <ChevronLeft size={22} />
            </button>
            <button type="button" onClick={togglePause} aria-label={paused ? "Resume" : "Pause"} className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-300 text-black transition active:scale-95">
              {paused ? <Play size={30} /> : <Pause size={30} />}
            </button>
            <button type="button" onClick={() => goTo(index + 1)} aria-label="Skip" className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06]">
              <SkipForward size={22} />
            </button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-5 pb-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200">
            <Check size={40} />
          </div>
          <h2 className="mt-5 text-3xl font-semibold">Nice work</h2>
          <p className="mt-2 text-white/60">
            {title} · {minutesLabel(elapsed)}
          </p>
          <button type="button" onClick={finish} disabled={saved === "saving"} className="mt-10 min-h-14 w-full rounded-2xl bg-emerald-300 text-lg font-medium text-black disabled:opacity-60">
            {saved === "saving" ? "Saving…" : "Done"}
          </button>
          {saved === "error" && <p className="mt-2 text-sm text-amber-200">Couldn&apos;t save, but nice work anyway.</p>}
        </div>
      )}
    </div>
  );
}
