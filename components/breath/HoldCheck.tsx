"use client";

import { ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { saveHold } from "@/lib/breath/actions";
import { HOLD_SAFETY, HOLD_STEPS, holdBand } from "@/lib/breath/plan";
import { haptic } from "@/lib/haptics";

/** The seated CO2 hold check: a stopwatch from a normal breath out to the first clear urge to breathe. */
export default function HoldCheck() {
  const router = useRouter();
  const [stage, setStage] = useState<"ready" | "holding" | "result">("ready");
  const [ok, setOk] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const began = useRef(0);

  useEffect(() => {
    if (stage !== "holding") return;
    const t = setInterval(() => setSeconds((performance.now() - began.current) / 1000), 100);
    return () => clearInterval(t);
  }, [stage]);

  const start = () => {
    began.current = performance.now();
    setSeconds(0);
    setMsg(null);
    setStage("holding");
    haptic("light");
  };
  const stop = () => {
    setSeconds((performance.now() - began.current) / 1000);
    setStage("result");
    haptic("rigid");
  };
  const save = async () => {
    setSaving(true);
    const r = await saveHold(seconds);
    setSaving(false);
    if (r.ok) {
      haptic("success");
      router.push("/recovery/breathe");
      router.refresh();
    } else setMsg(r.error);
  };
  const band = holdBand(seconds);

  return (
    <div className="mt-6">
      <div className="flex gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] p-4 text-sm text-amber-50/90">
        <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
        <p>{HOLD_SAFETY}</p>
      </div>

      {stage === "ready" && (
        <>
          <ol className="mt-5 grid gap-2 text-white/75">
            {HOLD_STEPS.map((s, i) => (
              <li key={s} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs tabular-nums">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <label className="mt-5 flex items-center gap-3 text-sm text-white/75">
            <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="h-5 w-5 accent-emerald-300" />
            I&apos;m sitting down, away from water.
          </label>
          <button type="button" disabled={!ok} onClick={start} className="mt-5 min-h-14 w-full rounded-2xl bg-emerald-300 text-lg font-semibold text-emerald-950 active:scale-95 disabled:opacity-40">
            Start
          </button>
        </>
      )}

      {stage === "holding" && (
        <button type="button" onClick={stop} className="mt-6 flex aspect-square w-full flex-col items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.05] active:scale-[0.99]">
          <span className="text-6xl font-bold tabular-nums">{seconds.toFixed(1)}</span>
          <span className="mt-3 text-white/60">Tap at the first clear urge to breathe</span>
        </button>
      )}

      {stage === "result" && (
        <div className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-6 text-center">
          <p className="text-6xl font-bold tabular-nums">{`${seconds.toFixed(1)}s`}</p>
          <p className={`mt-2 font-semibold ${band.tone === "good" ? "text-emerald-300" : band.tone === "mid" ? "text-amber-200" : "text-rose-300"}`}>{band.label}</p>
          <p className="mt-3 text-sm text-white/60">
            Was your first breath calm? If you had to gasp, you held too long. Redo it after a couple of minutes. The trend matters more than any one number, so take it at the same time of day.
          </p>
          {msg && <p className="mt-3 text-sm text-rose-300">{msg}</p>}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setStage("ready")} className="min-h-12 rounded-2xl border border-white/10 font-medium text-white/75">Redo</button>
            <button type="button" disabled={saving} onClick={save} className="min-h-12 rounded-2xl bg-emerald-300 font-semibold text-emerald-950 disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
