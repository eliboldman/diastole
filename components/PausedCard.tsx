"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { endPause, logSymptoms } from "@/lib/workouts/life-actions";

const SYMPTOMS = ["Fever", "Cough", "Sore throat", "Congestion", "Headache", "Upset stomach", "Tired", "Achy", "Pain", "Swelling"];
const ENERGY = ["Wiped", "Low", "OK", "Good", "Great"];

/** While sick or injured: a 10-second daily check, and "I'm feeling better". */
export default function PausedCard({ kind, since, today, logged, hasCoach }: { kind: "sick" | "injured"; since: string; today: string; logged: { symptoms: string[]; energy: number | null } | null; hasCoach: boolean }) {
  const router = useRouter();
  const [symptoms, setSymptoms] = useState<string[]>(logged?.symptoms ?? []);
  const [energy, setEnergy] = useState<number | null>(logged?.energy ?? null);
  const [msg, setMsg] = useState<string | null>(logged ? "Logged today." : null);
  const [pending, start] = useTransition();
  const days = Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 86_400_000));

  return (
    <section className="row-in mt-6 rounded-[28px] border border-sky-200/15 bg-sky-200/[0.04] p-5">
      <p className="text-[11px] uppercase tracking-[0.15em] text-sky-100/70">Plan paused</p>
      <p className="mt-1 text-lg font-medium">{kind === "sick" ? "Rest up" : "Take care of it"}{days ? ` · day ${days + 1}` : ""}</p>
      <p className="text-sm text-white/55">How are you today?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SYMPTOMS.filter((s) => kind === "sick" || ["Pain", "Swelling", "Achy", "Tired"].includes(s)).map((s) => {
          const on = symptoms.includes(s);
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => setSymptoms(on ? symptoms.filter((x) => x !== s) : [...symptoms, s])} className={`min-h-10 rounded-full border px-3 text-sm ${on ? "border-sky-200/40 bg-sky-200/15" : "border-white/10 text-white/65"}`}>
              {s}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1 rounded-2xl bg-white/[0.04] p-1" role="radiogroup" aria-label="Energy">
        {ENERGY.map((e, i) => (
          <button key={e} type="button" role="radio" aria-checked={energy === i + 1} onClick={() => setEnergy(i + 1)} className={`min-h-10 rounded-xl text-xs ${energy === i + 1 ? "bg-white/[0.12] text-white" : "text-white/55"}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await logSymptoms({ symptoms, energy, note: "" });
              setMsg(r.ok ? "Logged today." : r.error);
            })
          }
          className="min-h-11 rounded-2xl bg-white/[0.08] px-5 text-sm font-medium disabled:opacity-60"
        >
          Save
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await endPause();
              setMsg(r.ok ? r.message : r.error);
              router.refresh();
            })
          }
          className="min-h-11 rounded-2xl bg-emerald-300 px-5 text-sm font-medium text-black disabled:opacity-60"
        >
          I&apos;m feeling better
        </button>
        {msg && <span className="text-xs text-white/55" role="status">{msg}</span>}
      </div>
      <p className="mt-3 text-xs text-white/40">
        {hasCoach ? "Your coach sees what you log. " : ""}General guidance only. If symptoms are severe or not improving, see a doctor.
      </p>
    </section>
  );
}
