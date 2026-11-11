"use client";

import { Check, ChevronRight, Dumbbell, Pause, Play, SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { logStrength } from "@/lib/strength/actions";
import { BY_SLUG } from "@/lib/strength/catalog";
import { describeStrength, type LoggedItem, type StrengthItem } from "@/lib/strength/workout";

const KG_LB = 2.20462;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, "0")}`;
type Phase = "overview" | "set" | "rest" | "finish" | "done";

/** Tap through a strength session set by set, log what you did, rest timer, RPE at the end. */
export default function StrengthSession({ workoutId, items, unit, videos, done: alreadyDone }: { workoutId: string; items: StrengthItem[]; unit: "kg" | "lb"; videos: Record<string, { video: string; poster: string | null }>; done: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("overview");
  const [ex, setEx] = useState(0);
  const [set, setSet] = useState(0);
  const [log, setLog] = useState<LoggedItem[]>(() => items.map((it) => ({ slug: it.slug, sets: [] })));
  const [reps, setReps] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [restLeft, setRestLeft] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rpe, setRpe] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef<number>(0);

  const item = items[ex];
  const info = item ? BY_SLUG.get(item.slug) : undefined;
  const showW = (kg: number | null) => (kg === null ? "" : unit === "lb" ? String(Math.round(kg * KG_LB)) : String(Math.round(kg * 10) / 10));

  // Pre-fill a set with the plan (or what you just did on the previous set of that exercise).
  const prefill = (exIndex: number, current: LoggedItem[]) => {
    const it = items[exIndex];
    if (!it) return;
    const last = current[exIndex]?.sets[current[exIndex].sets.length - 1];
    setReps(String(it.seconds ?? last?.reps ?? it.reps ?? ""));
    setWeight(showW(last?.kg ?? it.kg));
  };

  // Rest countdown, with a buzz at the end.
  useEffect(() => {
    if (phase !== "rest" || paused) return;
    const t = setTimeout(() => {
      if (restLeft <= 1) {
        navigator.vibrate?.([200, 80, 200]);
        setRestLeft(0);
        setPhase("set");
      } else setRestLeft(restLeft - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, restLeft, paused]);

  const finishSet = () => {
    const n = Number(reps);
    const w = Number(weight);
    const entry = { reps: item.seconds ? null : n > 0 ? n : null, seconds: item.seconds ? (n > 0 ? n : item.seconds) : null, kg: w > 0 ? Math.round((unit === "lb" ? w / KG_LB : w) * 100) / 100 : null };
    const next = log.map((l, i) => (i === ex ? { ...l, sets: [...l.sets, entry] } : l));
    setLog(next);
    navigator.vibrate?.(15);
    if (set + 1 < item.sets) {
      setSet(set + 1);
      prefill(ex, next);
      if (item.rest_s) {
        setRestLeft(item.rest_s);
        setPaused(false);
        setPhase("rest");
      }
    } else if (ex + 1 < items.length) {
      setEx(ex + 1);
      setSet(0);
      prefill(ex + 1, next);
      setRestLeft(60);
      setPaused(false);
      setPhase("rest");
    } else setPhase("finish");
  };

  if (phase === "done")
    return (
      <section className="mt-6 rounded-[28px] border border-emerald-300/25 bg-emerald-300/[0.06] p-6 text-center">
        <Check size={28} className="mx-auto text-emerald-200" aria-hidden />
        <p className="mt-2 text-lg font-medium">{msg}</p>
      </section>
    );

  if (phase === "overview")
    return (
      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <Dumbbell size={18} className="text-emerald-200" aria-hidden /> Exercises
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
          {describeStrength(items, unit).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            startedAt.current = Date.now();
            prefill(0, log);
            setPhase("set");
          }}
          className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-[0.98] sm:w-auto"
        >
          <Play size={16} aria-hidden /> {alreadyDone ? "Do it again" : "Start session"}
        </button>
        <p className="mt-2 text-xs text-white/45">Tap through each set, log what you did, and rest with a timer. Takes your watch out of the loop; your Garmin also has this workout if you prefer it there.</p>
      </section>
    );

  if (phase === "finish")
    return (
      <section className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
        <h2 className="text-lg font-medium">How hard was that overall?</h2>
        <p className="mt-1 text-sm text-white/55">1 is barely anything, 10 is nothing left.</p>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup" aria-label="Session effort, 1 to 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rpe === n} onClick={() => setRpe(n)} className={`min-h-12 rounded-xl border text-sm font-medium ${rpe === n ? "border-emerald-300/50 bg-emerald-300/20 text-emerald-50" : "border-white/10 text-white/70"}`}>
              {n}
            </button>
          ))}
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Anything to tell your coach? (optional)" className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[16px] text-white placeholder:text-white/35 focus:outline-none" />
        <button
          type="button"
          disabled={pending || rpe === null}
          onClick={() =>
            start(async () => {
              const r = await logStrength({ plannedWorkoutId: workoutId, items: log, rpe, durationS: Math.round((Date.now() - startedAt.current) / 1000), note });
              if (r.ok) {
                setMsg(r.message);
                setPhase("done");
                router.refresh();
              } else setMsg(r.error);
            })
          }
          className="mt-4 flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save session"}
        </button>
        {msg && <p className="mt-2 text-sm text-red-200">{msg}</p>}
      </section>
    );

  const clip = info ? videos[info.slug] : undefined;
  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055]" aria-live="polite">
      {clip && <video key={clip.video} src={clip.video} poster={clip.poster ?? undefined} autoPlay muted loop playsInline className="aspect-video w-full bg-black object-cover" />}
      <div className="p-5">
        <p className="text-xs uppercase tracking-[0.15em] text-white/45">
          Exercise {ex + 1} of {items.length}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">{info?.name}</h2>
        <p className="mt-1 text-sm text-white/60">{info?.cue}</p>
        {item.note && <p className="mt-1 text-sm text-emerald-50/80">Coach: {item.note}</p>}

        {phase === "rest" ? (
          <div className="mt-5 text-center">
            <p className="text-sm text-white/55">Rest{set === 0 ? `, then ${info?.name}` : ""}</p>
            <p className="mt-1 text-5xl font-semibold tabular-nums">{clock(restLeft)}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Resume rest timer" : "Pause rest timer"} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 text-white/80">
                {paused ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button type="button" onClick={() => setRestLeft((r) => r + 15)} className="min-h-12 rounded-2xl border border-white/15 px-4 text-sm text-white/80">
                +15 s
              </button>
              <button type="button" onClick={() => setPhase("set")} className="flex min-h-12 items-center gap-1.5 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm text-emerald-50">
                <SkipForward size={15} aria-hidden /> Skip
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <p className="text-sm text-white/70">
              Set {set + 1} of {item.sets}
              {info?.perSide ? " · each side" : ""}
              {item.tempo ? ` · tempo ${item.tempo}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm text-white/60">
                {item.seconds ? "Seconds" : "Reps"}
                <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, "").slice(0, 3))} className="mt-1 block w-24 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-2xl font-semibold tabular-nums text-white focus:border-emerald-300/40 focus:outline-none" />
              </label>
              {info?.load !== "band" && (
                <label className="text-sm text-white/60">
                  {unit}
                  <input inputMode="decimal" value={weight} placeholder={info?.load === "bodyweight" ? "BW" : "—"} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))} className="mt-1 block w-28 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3 text-2xl font-semibold tabular-nums text-white placeholder:text-white/30 focus:border-emerald-300/40 focus:outline-none" />
                </label>
              )}
              <button type="button" onClick={finishSet} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 text-base font-medium text-black transition active:scale-[0.98]">
                Done <ChevronRight size={18} aria-hidden />
              </button>
            </div>
            <p className="mt-3 text-xs text-white/45">
              Logged: {log[ex].sets.map((s) => (s.seconds ? `${s.seconds}s` : `${s.reps ?? "–"}${s.kg ? ` × ${showW(s.kg)}` : ""}`)).join(", ") || "nothing yet"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
