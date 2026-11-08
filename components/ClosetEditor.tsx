"use client";

import { Bike, Footprints, Plus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import ShoeSearch from "@/components/ShoeSearch";
import { saveCloset } from "@/lib/closet-actions";
import { BIKE_KINDS, defaultShoe, EXTRAS, SHOE_KINDS, shoeWear, TRAINER_KINDS, type BikeKind, type Closet, type ShoeKind, type TrainerKind } from "@/lib/closet";

const input = "min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base sm:text-sm placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";
const select = `${input} pr-8`;
const small = "text-[11px] uppercase tracking-[0.15em] text-white/50";
const newId = () => Math.random().toString(36).slice(2, 10);

function RemoveButton({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={`Remove ${what}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/45 transition active:scale-90 hover:bg-white/[0.08] hover:text-white/80">
      <Trash2 size={16} />
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-2 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm text-emerald-200 hover:bg-white/[0.05]">
      <Plus size={16} /> {label}
    </button>
  );
}

/** Edit an athlete's closet. Saves on its own a moment after each change. */
export default function ClosetEditor({
  athleteId,
  initial,
  mileage,
  units = "mi",
  today,
}: {
  athleteId: string;
  initial: Closet;
  mileage?: Record<string, number>; // meters per shoe id
  units?: "mi" | "km";
  today: string; // YYYY-MM-DD in the athlete's timezone: new shoes count runs from today
}) {
  const perUnit = units === "mi" ? 1609.344 : 1000;
  const dist = (m: number) => `${Math.round(m / perUnit)} ${units}`;
  const [c, setC] = useState<Closet>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (next: Closet) => {
    setC(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("saving");
      startTransition(async () => {
        const r = await saveCloset(athleteId, next);
        setStatus(r.ok ? "saved" : "error");
      });
    }, 600);
  };

  const setShoe = (i: number, patch: Partial<Closet["shoes"][number]>) => update({ ...c, shoes: c.shoes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setBike = (i: number, patch: Partial<Closet["bikes"][number]>) => update({ ...c, bikes: c.bikes.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <div className="space-y-6">
      <div>
        <p className={`${small} flex items-center gap-2`}>
          <Footprints size={14} aria-hidden /> Shoes
        </p>
        <ul className="mt-2 space-y-2">
          {c.shoes.map((s, i) => {
            const m = mileage?.[s.id];
            const wear = m === undefined ? null : shoeWear(m);
            const isDefault = defaultShoe(c)?.id === s.id;
            return (
              <li key={s.id} className={`rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 ${s.retired ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-2">
                  <ShoeSearch className={input} value={s.model} onChange={(model, kind) => setShoe(i, kind ? { model, kind } : { model })} />
                  <select className={`${select} max-w-[9.5rem]`} value={s.kind} aria-label="Shoe type" onChange={(e) => setShoe(i, { kind: e.target.value as ShoeKind })}>
                    {SHOE_KINDS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <RemoveButton onClick={() => update({ ...c, shoes: c.shoes.filter((_, j) => j !== i) })} what={s.model || "shoe"} />
                </div>
                <details className="group px-1">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-xs text-white/55">
                    <span className="min-w-0 truncate">
                      {m !== undefined && <span className={wear === "replace" ? "text-amber-200" : wear === "worn" ? "text-amber-100/80" : "text-white/70"}>{dist(m)}</span>}
                      {m !== undefined && " · "}
                      {s.retired ? "Retired" : isDefault ? "Default for runs" : "Tap for details"}
                      {wear === "replace" && !s.retired ? " · time to think about a new pair" : wear === "worn" && !s.retired ? " · getting worn" : ""}
                    </span>
                    <span className="shrink-0 text-emerald-200 group-open:hidden">Details</span>
                  </summary>
                  <div className="grid gap-2 pb-2 pt-1 sm:grid-cols-3 sm:items-center">
                    <label className="flex items-center gap-2 text-xs text-white/60">
                      <span className="shrink-0">Already on them</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={3000}
                        className={`${input} min-h-10 w-24`}
                        value={s.start_m ? Math.round((s.start_m / perUnit) * 10) / 10 : ""}
                        placeholder="0"
                        aria-label={`${units} already on ${s.model || "these shoes"}`}
                        onChange={(e) => setShoe(i, { start_m: Math.max(0, Number(e.target.value) || 0) * perUnit })}
                      />
                      <span>{units}</span>
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-emerald-300"
                        checked={s.default}
                        disabled={s.retired}
                        onChange={(e) => update({ ...c, shoes: c.shoes.map((x, j) => ({ ...x, default: j === i ? e.target.checked : e.target.checked ? false : x.default })) })}
                      />
                      Default for runs
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-xs text-white/70">
                      <input type="checkbox" className="h-5 w-5 accent-emerald-300" checked={s.retired} onChange={(e) => setShoe(i, { retired: e.target.checked, default: e.target.checked ? false : s.default })} />
                      Retired
                    </label>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-white/45">Runs count toward your default pair unless you pick different shoes on the run.</p>
        {c.shoes.length < 12 && <AddButton onClick={() => update({ ...c, shoes: [...c.shoes, { id: newId(), model: "", kind: "daily", start_m: 0, since: today, default: false, retired: false }] })} label="Add shoes" />}
      </div>

      <div>
        <p className={`${small} flex items-center gap-2`}>
          <Bike size={14} aria-hidden /> Bikes
        </p>
        <ul className="mt-2 space-y-2">
          {c.bikes.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2">
              <input className={input} value={b.model} maxLength={60} placeholder="Model, e.g. Tarmac SL7" aria-label="Bike model" onChange={(e) => setBike(i, { model: e.target.value })} />
              <select className={`${select} max-w-[9.5rem]`} value={b.kind} aria-label="Bike type" onChange={(e) => setBike(i, { kind: e.target.value as BikeKind })}>
                {BIKE_KINDS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <RemoveButton onClick={() => update({ ...c, bikes: c.bikes.filter((_, j) => j !== i) })} what={b.model || "bike"} />
            </li>
          ))}
        </ul>
        {c.bikes.length < 12 && <AddButton onClick={() => update({ ...c, bikes: [...c.bikes, { id: newId(), model: "", kind: "road" }] })} label="Add a bike" />}
      </div>

      <div>
        <p className={small}>Indoor trainer</p>
        <div className="mt-2 flex gap-2">
          <select
            className={`${select} max-w-[11rem]`}
            value={c.trainer.kind}
            aria-label="Trainer type"
            onChange={(e) => update({ ...c, trainer: { ...c.trainer, kind: e.target.value as TrainerKind } })}
          >
            {TRAINER_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {c.trainer.kind !== "none" && (
            <input className={input} value={c.trainer.model} maxLength={60} placeholder="Model, e.g. Wahoo Kickr" aria-label="Trainer model" onChange={(e) => update({ ...c, trainer: { ...c.trainer, model: e.target.value } })} />
          )}
        </div>
      </div>

      <div>
        <p className={small}>Other gear and access</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {EXTRAS.map(([k, l]) => {
            const on = Boolean(c.extras[k]);
            return (
              <li key={k} className={`rounded-xl border px-3 py-2 ${on ? "border-emerald-300/25 bg-emerald-300/[0.06]" : "border-white/[0.08] bg-white/[0.03]"}`}>
                <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    className="h-5 w-5 shrink-0 accent-emerald-300"
                    onChange={() => {
                      const extras = { ...c.extras };
                      if (on) delete extras[k];
                      else extras[k] = { model: "" };
                      update({ ...c, extras });
                    }}
                  />
                  <span className="min-w-0">{l}</span>
                </label>
                {on && (
                  <input
                    className={`${input} mt-1 min-h-10`}
                    value={c.extras[k]!.model}
                    maxLength={60}
                    placeholder="Model or details (optional)"
                    aria-label={`${l} details`}
                    onChange={(e) => update({ ...c, extras: { ...c.extras, [k]: { model: e.target.value } } })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <label className="block">
        <span className={small}>Anything else</span>
        <textarea
          className={`${input} mt-2 min-h-20 py-2`}
          value={c.notes}
          maxLength={500}
          placeholder="e.g. Pool is only open 6–8 am, no bike rack on my car, race wheels for the A race"
          onChange={(e) => update({ ...c, notes: e.target.value })}
        />
      </label>

      <p className="text-xs text-white/45" aria-live="polite">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Check your connection." : "Changes save automatically."}
      </p>
    </div>
  );
}
