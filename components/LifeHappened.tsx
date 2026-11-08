"use client";

import { Check, Clock, Frown, HeartPulse, Loader2, Plane, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { lifeHappened, startPause } from "@/lib/workouts/life-actions";

type W = { id: string; title: string };
type Step = "menu" | "minutes" | "sick" | "result";

/**
 * "Life happened?" on today's workout: short on time, feeling off, can't train today, missed
 * yesterday, or sick/injured. One sheet, one question at a time; ends with what changed and why.
 */
export default function LifeHappened({ today, missed, hasCoach }: { today: W | null; missed: W | null; hasCoach: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("menu");
  const [result, setResult] = useState<{ ok: boolean; title: string; text: string } | null>(null);
  const [kind, setKind] = useState<"sick" | "injured">("sick");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!today && !missed) return null;

  const show = () => {
    setStep("menu");
    setResult(null);
    setOpen(true);
  };
  const ask = (workoutId: string, reason: "minutes" | "feeling_off" | "missed" | "cant_today", minutes?: number) =>
    start(async () => {
      const r = await lifeHappened({ workoutId, reason, minutes });
      setResult(r.ok ? { ok: true, title: r.status === "pending" ? `Sent to your coach: ${r.summary}` : r.summary, text: r.why } : { ok: false, title: "Couldn't change it", text: r.error });
      setStep("result");
      router.refresh();
    });
  const pause = () =>
    start(async () => {
      const r = await startPause({ kind, note });
      setResult(
        r.ok
          ? { ok: true, title: "Plan paused. Rest up.", text: `${r.removed ? `${r.removed} session${r.removed === 1 ? "" : "s"} in the next week came off your calendar. ` : ""}${hasCoach ? "Your coach knows. " : ""}Log how you feel each day, and tap "I'm feeling better" when you're ready.` }
          : { ok: false, title: "Couldn't pause", text: r.error },
      );
      setStep("result");
      router.refresh();
    });

  const option = (icon: React.ReactNode, label: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} disabled={pending} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 text-left transition active:scale-[0.99] hover:bg-white/[0.08] disabled:opacity-60">
      <span className="shrink-0 text-emerald-200">{icon}</span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block truncate text-xs text-white/50">{sub}</span>
      </span>
    </button>
  );

  return (
    <>
      <button type="button" onClick={show} className="mt-3 min-h-10 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline">
        Life happened?
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Life happened" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="toast-in w-full max-w-md rounded-t-[28px] border border-white/10 bg-panel p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] sm:rounded-[28px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium">{step === "minutes" ? "How much time do you have?" : step === "sick" ? "Pause your plan" : step === "result" ? "" : "What's going on?"}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-xl text-white/55 hover:bg-white/[0.06]">
                <X size={18} />
              </button>
            </div>

            {step === "menu" && (
              <div className="space-y-2">
                {today && option(<Clock size={20} />, "I only have a little time", today.title, () => setStep("minutes"))}
                {today && option(<Frown size={20} />, "I'm feeling off", "Make today easier", () => ask(today.id, "feeling_off"))}
                {today && option(<Plane size={20} />, "I can't train today", "Travel, work, life", () => ask(today.id, "cant_today"))}
                {missed && option(<RotateCcw size={20} />, `I missed ${missed.title}`, "Yesterday", () => ask(missed.id, "missed"))}
                {option(<HeartPulse size={20} />, "I'm sick or injured", "Pause the plan", () => setStep("sick"))}
                {hasCoach && <p className="pt-1 text-xs text-white/45">Small tweaks happen right away. Bigger ones go to your coach first.</p>}
              </div>
            )}

            {step === "minutes" && today && (
              <div className="grid grid-cols-2 gap-2">
                {[20, 30, 45, 60].map((m) => (
                  <button key={m} type="button" disabled={pending} onClick={() => ask(today.id, "minutes", m)} className="min-h-14 rounded-2xl bg-white/[0.06] text-lg font-medium transition active:scale-95 disabled:opacity-60">
                    {m} min
                  </button>
                ))}
              </div>
            )}

            {step === "sick" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(["sick", "injured"] as const).map((k) => (
                    <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`min-h-12 rounded-2xl border text-sm capitalize ${kind === k ? "border-emerald-300/40 bg-emerald-300/15" : "border-white/10 bg-white/[0.04] text-white/70"}`}>
                      {k}
                    </button>
                  ))}
                </div>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Anything your coach should know? (optional)" className="min-h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base placeholder:text-white/35 focus:outline-none sm:text-sm" />
                <button type="button" disabled={pending} onClick={pause} className="min-h-12 w-full rounded-2xl bg-emerald-300 font-medium text-black disabled:opacity-60">
                  Pause my plan
                </button>
                <p className="text-xs text-white/45">The next week&apos;s sessions come off your calendar. When you&apos;re better, you&apos;ll ease back in{hasCoach ? " with a plan your coach approves" : ""}.</p>
              </div>
            )}

            {pending && step !== "result" && (
              <p className="mt-3 flex items-center gap-2 text-sm text-white/55">
                <Loader2 size={15} className="animate-spin" /> Working on it…
              </p>
            )}

            {step === "result" && result && (
              <div className="text-center">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${result.ok ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-200/15 text-amber-100"}`}>{result.ok ? <Check size={26} /> : <X size={26} />}</div>
                <p className="mt-3 text-lg font-medium">{result.title}</p>
                <p className="mt-1 text-sm text-white/60">{result.text}</p>
                <button type="button" onClick={() => setOpen(false)} className="mt-5 min-h-12 w-full rounded-2xl bg-white/[0.08] font-medium">
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
