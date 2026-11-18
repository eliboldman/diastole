"use client";

import { ChevronLeft, ChevronRight, Minus, Plus, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveScreen } from "@/lib/mobility/actions";
import type { Answers, Side, Test } from "@/lib/mobility/screen";

type Media = Record<string, { video: string; poster: string | null }>;

/** The mobility screen, one test per step: demo clip, how to do it, then an answer for each side. */
export default function ScreenWizard({ tests, media }: { tests: Test[]; media: Media }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const t = tests[step];
  const sides: Side[] = t.sided ? ["left", "right"] : ["both"];
  const got = answers[t.id] ?? {};
  const complete = sides.every((s) => typeof got[s] === "number");
  const last = step === tests.length - 1;
  const set = (side: Side, v: number) => setAnswers((a) => ({ ...a, [t.id]: { ...a[t.id], [side]: v } }));
  const clip = media[t.clip];

  const finish = () =>
    start(async () => {
      setError(null);
      const r = await saveScreen(answers);
      if (r.ok) router.push("/recovery/mobility?new=1");
      else setError(r.error);
    });

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={1} aria-valuemax={tests.length} aria-valuenow={step + 1} aria-label="Test">
          <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${((step + 1) / tests.length) * 100}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-white/55">{`${step + 1} of ${tests.length}`}</span>
      </div>

      <section key={t.id} className="row-in overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.05]">
        <div className="aspect-video bg-black/40">
          {clip ? (
            <video key={t.clip} src={clip.video} poster={clip.poster ?? undefined} autoPlay loop muted playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-emerald-300/10 to-transparent p-6 text-center text-sm text-white/55">
              <Video size={22} aria-hidden />
              Demo clip coming soon. Follow the steps below.
            </div>
          )}
        </div>

        <div className="p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">{t.short}</p>
          <h2 className="mt-1 text-xl font-semibold">{t.name}</h2>
          <ol className="mt-3 grid gap-1.5 text-sm text-white/75">
            {t.how.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-4 shrink-0 text-right tabular-nums text-white/40">{i + 1}</span>
                <span>{h}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 grid gap-4">
            {sides.map((side) => (
              <fieldset key={side}>
                <legend className="mb-2 text-sm font-medium text-white/80">{side === "both" ? "Your result" : side === "left" ? "Left side" : "Right side"}</legend>
                {"choices" in t.measure ? (
                  <div className="grid gap-2">
                    {t.measure.choices.map((c) => {
                      const on = got[side] === c.level;
                      return (
                        <button
                          key={c.level}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set(side, c.level)}
                          className={`min-h-12 rounded-2xl border px-4 py-2.5 text-left text-sm transition ${on ? "border-emerald-300/60 bg-emerald-300/15 text-white" : "border-white/10 bg-white/[0.03] text-white/75 hover:bg-white/[0.06]"}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Stepper
                    value={got[side]}
                    unit={t.measure.unit}
                    max={t.measure.max}
                    onChange={(v) => set(side, v)}
                    label={`${t.name}, ${side === "both" ? "result" : `${side} side`}`}
                  />
                )}
              </fieldset>
            ))}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex min-h-12 items-center gap-1 rounded-2xl px-4 text-sm text-white/70 hover:bg-white/[0.06] disabled:opacity-30"
        >
          <ChevronLeft size={16} aria-hidden /> Back
        </button>
        <button
          type="button"
          onClick={() => (last ? finish() : setStep((s) => s + 1))}
          disabled={!complete || pending}
          className="flex min-h-12 items-center gap-1 rounded-2xl bg-emerald-300 px-6 text-sm font-semibold text-emerald-950 transition active:scale-95 disabled:opacity-40"
        >
          {last ? (pending ? "Saving…" : "See my results") : "Next"} {!last && <ChevronRight size={16} aria-hidden />}
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-white/40">Stop any test that hurts. This is a general mobility check, not a medical assessment.</p>
    </div>
  );
}

function Stepper({ value, unit, max, onChange, label }: { value: number | undefined; unit: "cm" | "s"; max: number; onChange: (v: number) => void; label: string }) {
  const step = unit === "cm" ? 0.5 : 1;
  const v = value ?? (unit === "cm" ? 10 : 15);
  const clamp = (n: number) => Math.min(max, Math.max(0, Math.round(n / step) * step));
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Less" onClick={() => onChange(clamp(v - step))} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] active:scale-90">
        <Minus size={18} aria-hidden />
      </button>
      <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={step}
          value={value ?? ""}
          placeholder={String(v)}
          aria-label={label}
          onChange={(e) => e.target.value !== "" && onChange(clamp(Number(e.target.value)))}
          className="w-20 bg-transparent text-center text-2xl font-semibold tabular-nums outline-none placeholder:text-white/25"
        />
        <span className="text-sm text-white/50">{unit === "cm" ? "cm" : "sec"}</span>
      </label>
      <button type="button" aria-label="More" onClick={() => onChange(clamp(v + step))} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] active:scale-90">
        <Plus size={18} aria-hidden />
      </button>
    </div>
  );
}
