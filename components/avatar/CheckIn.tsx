"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import Avatar from "@/components/avatar/Avatar";
import { saveCheckin } from "@/lib/avatar/actions";
import { cyclePain, FEEL, PAIN_COLOR, PAIN_LABEL, RPE_LABEL, sessionLoad, SPOTS, spotLabel, type Pain, type PainLevel, type Spot } from "@/lib/avatar/pain";

export type CheckinData = { feel: number | null; rpe: number | null; pain: Pain; note: string | null; updated_at?: string };

const BACK_SPOTS = /upper_back|lower_back|hamstring|calf|hip_/;

/** "How did it go?": feel, effort, anything that hurts, a note. The athlete fills it in; the coach reads it. */
export default function CheckIn({
  activityId,
  look,
  initial,
  editable,
  durationS,
  firstName,
  presetFeel,
}: {
  activityId: string;
  look: unknown;
  initial: CheckinData | null;
  editable: boolean;
  durationS: number | null;
  firstName: string;
  presetFeel?: number | null;
}) {
  const router = useRouter();
  const [feel, setFeel] = useState<number | null>(initial?.feel ?? presetFeel ?? null);
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [pain, setPain] = useState<Pain>(initial?.pain ?? {});
  const [hurts, setHurts] = useState(Object.keys(initial?.pain ?? {}).length > 0);
  const [note, setNote] = useState(initial?.note ?? "");
  const [view, setView] = useState<"front" | "back">("front");
  const [saved, setSaved] = useState(Boolean(initial));
  const [dirty, setDirty] = useState(Boolean(presetFeel && !initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const touch = () => {
    setDirty(true);
    setSaved(false);
  };
  const sore = SPOTS.filter((s) => pain[s]).sort((a, b) => (pain[b] ?? 0) - (pain[a] ?? 0));

  // Tapped a face on Today: that tap is the check-in; save it now, the rest is optional.
  const autoSaved = useRef(false);
  useEffect(() => {
    if (!editable || initial || !presetFeel || autoSaved.current) return;
    autoSaved.current = true;
    void saveCheckin(activityId, { feel: presetFeel, rpe: null, pain: {}, note: "" }).then((r) => {
      if (r.ok) {
        setSaved(true);
        setDirty(false);
        router.refresh();
      }
    });
  }, [editable, initial, presetFeel, activityId, router]);
  const load = sessionLoad(rpe, durationS);

  if (!editable) {
    if (!initial) return <p className="text-sm text-white/55">{`${firstName} hasn't checked in on this workout yet.`}</p>;
    const f = FEEL.find((x) => x.v === initial.feel);
    return (
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex gap-6">
          {f && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">Felt</p>
              <p className="mt-1 text-2xl">
                {f.emoji} <span className="text-base text-white/80">{f.label}</span>
              </p>
            </div>
          )}
          {initial.rpe && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.15em] text-white/50">Effort</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {`${initial.rpe}/10`} <span className="text-sm font-normal text-white/60">{RPE_LABEL[initial.rpe]}</span>
              </p>
              {load && <p className="text-xs text-white/45">{`Session load ${load}`}</p>}
            </div>
          )}
        </div>
        <div className="min-w-0">
          {Object.keys(initial.pain).length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {SPOTS.filter((s) => initial.pain[s]).map((s) => (
                <li key={s} className="flex min-h-8 items-center gap-2 rounded-full border border-rose-300/25 bg-rose-300/[0.06] px-3 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PAIN_COLOR[initial.pain[s] as PainLevel] }} aria-hidden />
                  {spotLabel(s)}
                  <span className="text-white/45">{PAIN_LABEL[initial.pain[s] as PainLevel]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-white/55">Nothing hurt.</p>
          )}
          {initial.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/75">{`"${initial.note}"`}</p>}
        </div>
      </div>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveCheckin(activityId, { feel, rpe, pain: hurts ? (pain as Record<string, number>) : {}, note });
      if (!r.ok) return setError(r.error);
      navigator.vibrate?.([8, 30, 8]);
      setSaved(true);
      setDirty(false);
      router.refresh();
    });

  const tapSpot = (s: Spot) => {
    navigator.vibrate?.(6);
    setPain((p) => cyclePain(p, s));
    touch();
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="mb-2 text-sm font-medium">How did it feel?</p>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="How it felt">
          {FEEL.map((f) => (
            <button
              key={f.v}
              type="button"
              role="radio"
              aria-checked={feel === f.v}
              onClick={() => {
                setFeel(f.v);
                touch();
                navigator.vibrate?.(5);
              }}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border transition ${
                feel === f.v ? "border-emerald-300/50 bg-emerald-300/[0.12]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
              }`}
            >
              <span className={`text-2xl transition ${feel === f.v ? "scale-110" : feel ? "opacity-50" : ""}`} aria-hidden>
                {f.emoji}
              </span>
              <span className="mt-0.5 text-[11px] text-white/60">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <p className="text-sm font-medium">How hard was it?</p>
          <p className="text-sm tabular-nums text-white/70">{rpe ? `${rpe}/10 · ${RPE_LABEL[rpe]}` : "Slide to rate"}</p>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={rpe ?? 5}
          onChange={(e) => {
            setRpe(Number(e.target.value));
            touch();
          }}
          onPointerUp={() => navigator.vibrate?.(4)}
          aria-label="Effort from 1 (very easy) to 10 (max)"
          className={`h-11 w-full accent-emerald-300 ${rpe ? "" : "opacity-60"}`}
        />
        <p className="flex justify-between text-xs text-white/40">
          <span>Very easy</span>
          <span>{load ? `Session load ${load}` : ""}</span>
          <span>Max</span>
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Anything hurt?</p>
        <div className="inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="radiogroup" aria-label="Anything hurt">
          {[
            { v: false, label: "Nothing hurts" },
            { v: true, label: "Something hurts" },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={hurts === o.v}
              onClick={() => {
                setHurts(o.v);
                touch();
              }}
              className={`min-h-10 rounded-full px-4 text-sm transition ${hurts === o.v ? (o.v ? "bg-rose-300/15 text-rose-50 ring-1 ring-rose-300/30" : "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30") : "text-white/60 hover:text-white"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {hurts && (
          <div className="row-in mt-4 grid gap-4 md:grid-cols-[minmax(0,13rem)_1fr] md:items-start">
            <div className="flex flex-col items-center">
              <Avatar look={look} pain={pain} mode="pain" view={view} onPick={(h) => h.spot && tapSpot(h.spot)} className="h-72 w-48" title="Where it hurts" />
              <div className="mt-1 inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                {(["front", "back"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`min-h-9 rounded-full px-4 text-sm capitalize ${view === v ? "bg-white/10 text-white" : "text-white/60"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/60">Tap where it hurts: mild, moderate, severe, then off. Left and right are the figure&apos;s own sides.</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {sore.length === 0 && <li className="text-sm text-white/45">Nothing marked yet.</li>}
                {sore.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        setView(BACK_SPOTS.test(s) ? "back" : "front");
                        tapSpot(s);
                      }}
                      className="flex min-h-9 items-center gap-2 rounded-full border border-rose-300/25 bg-rose-300/[0.06] px-3 text-sm"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PAIN_COLOR[pain[s] as PainLevel] }} aria-hidden />
                      {spotLabel(s)}
                      <span className="text-white/45">{PAIN_LABEL[pain[s] as PainLevel]}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-white/40">Your coach sees this; your pods never do. Not medical advice: for sharp or lasting pain, see a professional.</p>
            </div>
          </div>
        )}
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">Anything else?</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => {
            setNote(e.target.value);
            touch();
          }}
          placeholder="Optional: legs heavy from the start, felt great on the hills…"
          className="w-full resize-y rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base text-white placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none sm:text-sm"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || (!dirty && saved) || (!feel && !rpe && !hurts && !note)}
          className="flex min-h-12 items-center gap-2 rounded-full bg-emerald-300 px-6 text-sm font-medium text-black transition hover:bg-emerald-200 disabled:opacity-50"
        >
          {saved && !dirty ? (
            <>
              <Check size={16} /> Checked in
            </>
          ) : pending ? (
            "Saving…"
          ) : initial ? (
            "Update check-in"
          ) : (
            "Save check-in"
          )}
        </button>
        {error && (
          <span role="alert" className="text-sm text-red-200">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
