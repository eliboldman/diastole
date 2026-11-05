"use client";

import { Check, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Avatar from "@/components/avatar/Avatar";
import { saveStrain } from "@/lib/avatar/actions";
import { cycle, LEVEL_LABEL, REGION_LABEL, REGIONS, type Level, type Region, type Strain } from "@/lib/avatar/strain";

const COLOR: Record<Level, string> = { 1: "#fcd34d", 2: "#fb923c", 3: "#f87171" };
const same = (a: Strain, b: Strain) => REGIONS.every((r) => (a[r] ?? 0) === (b[r] ?? 0));

/**
 * The muscles a workout worked, on the athlete's 3D avatar. Estimated automatically after the
 * workout; the athlete (or coach) taps muscles to change it. Saves itself.
 */
export default function MusclesWorked({
  activityId,
  look,
  auto,
  custom,
  reviewed,
  editable,
  firstName,
}: {
  activityId: string;
  look: unknown;
  auto: Strain;
  custom: Strain | null;
  reviewed: boolean;
  editable: boolean;
  firstName: string;
}) {
  const [strain, setStrain] = useState<Strain>(custom ?? auto);
  const [view, setView] = useState<"front" | "back">("front");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmed, setConfirmed] = useState(reviewed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edited = !same(strain, auto);

  const save = (next: Strain) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const r = await saveStrain(activityId, same(next, auto) ? null : (next as Record<string, number>));
      setStatus(r.ok ? "saved" : "error");
      if (r.ok) setConfirmed(true);
    }, 600);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const tap = (r: Region) => {
    navigator.vibrate?.(6);
    const next = cycle(strain, r);
    setStrain(next);
    save(next);
  };

  const worked = REGIONS.filter((r) => strain[r]).sort((a, b) => (strain[b] ?? 0) - (strain[a] ?? 0));
  // Which side a muscle shows on, so tapping its chip turns the figure the right way.
  const BACK: Region[] = ["traps", "upper_back", "lats", "triceps", "lower_back", "glutes", "hamstrings", "calves"];

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_1fr] md:items-start">
      <div className="flex flex-col items-center">
        <Avatar look={look} strain={strain} view={view} onPick={editable ? tap : undefined} className="h-80 w-52" title={`Muscles worked by ${firstName}`} />
        <div className="mt-1 inline-flex gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1" role="tablist" aria-label="Side">
          {(["front", "back"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`min-h-9 rounded-full px-4 text-sm capitalize transition ${view === v ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30" : "text-white/60 hover:text-white"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-white/60">
          {editable
            ? edited
              ? "Your version. Tap any muscle on the figure to change it."
              : "Estimated from this workout's demands. Tap a muscle on the figure to change it: light, moderate, hard, then off."
            : edited
              ? `Marked by ${firstName}.`
              : "Estimated from this workout's demands."}
        </p>

        <ul className="mt-3 flex flex-wrap gap-1.5">
          {worked.length === 0 && <li className="text-sm text-white/45">{editable ? "Nothing marked. Tap the figure to add muscles." : "No muscles marked."}</li>}
          {worked.map((r) => (
            <li key={r}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => {
                  setView(BACK.includes(r) ? "back" : "front");
                  tap(r);
                }}
                className="flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-sm transition enabled:active:scale-95 enabled:hover:bg-white/[0.08]"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[strain[r]!] }} aria-hidden />
                {REGION_LABEL[r]}
                <span className="text-white/45">{LEVEL_LABEL[strain[r]!]}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex flex-wrap gap-3 text-xs text-white/50" aria-label="Key">
          {([1, 2, 3] as Level[]).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[l] }} aria-hidden />
              {LEVEL_LABEL[l]}
            </span>
          ))}
        </p>

        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!confirmed && !edited && (
              <button
                type="button"
                onClick={async () => {
                  setStatus("saving");
                  const r = await saveStrain(activityId, null, true);
                  setStatus(r.ok ? "saved" : "error");
                  if (r.ok) setConfirmed(true);
                }}
                className="flex min-h-11 items-center gap-2 rounded-full bg-emerald-300 px-5 text-sm font-medium text-black transition active:scale-95"
              >
                <Check size={16} /> Looks right
              </button>
            )}
            {edited && (
              <button
                type="button"
                onClick={() => {
                  setStrain(auto);
                  save(auto);
                }}
                className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.09]"
              >
                <RotateCcw size={15} /> Reset to estimate
              </button>
            )}
            <span className="text-xs text-white/40" aria-live="polite">
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Try again." : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
