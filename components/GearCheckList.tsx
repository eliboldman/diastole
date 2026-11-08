"use client";

import { Bike, Footprints } from "lucide-react";
import { useState, useTransition } from "react";

import { setActivityBike, setActivityShoe } from "@/lib/closet-actions";

export type GearAsk = {
  id: string;
  gear: "shoe" | "bike";
  name: string;
  start: string; // ISO
  km: number;
  options: { id: string; model: string; isDefault: boolean }[];
};

/** One row per untagged session; tapping a chip tags it and the row goes away. */
export default function GearCheckList({ asks }: { asks: GearAsk[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const left = asks.filter((a) => !done.has(a.id));
  if (!left.length) {
    return done.size ? <p className="row-in mt-6 px-1 text-sm text-white/50">Gear tagged. Mileage is up to date. 👟</p> : null;
  }
  const allShoes = left.every((a) => a.gear === "shoe");

  const pick = (a: GearAsk, gearId: string) => {
    setFailed(null);
    start(async () => {
      const r = a.gear === "bike" ? await setActivityBike(a.id, gearId) : await setActivityShoe(a.id, gearId);
      if (r.ok) setDone((d) => new Set(d).add(a.id));
      else setFailed(a.id);
    });
  };

  return (
    <section className="row-in mt-6 rounded-[28px] border border-white/10 bg-white/[0.05] p-5" aria-label="Tag your gear">
      <h2 className="text-lg font-medium">{allShoes ? "Which shoes?" : "Which gear?"}</h2>
      <p className="mt-1 text-sm text-white/55">Tag recent sessions so your mileage stays right.</p>
      <ul className="mt-4 space-y-4">
        {left.map((a) => {
          const Icon = a.gear === "bike" ? Bike : Footprints;
          const when = new Date(a.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          return (
            <li key={a.id}>
              <p className="flex items-center gap-2 text-sm">
                <Icon size={15} className="shrink-0 text-white/50" aria-hidden />
                <span className="min-w-0 truncate">{a.name}</span>
                <span className="shrink-0 text-white/45">· {when}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={pending}
                    onClick={() => pick(a, o.id)}
                    className={`min-h-11 max-w-full truncate rounded-full border px-4 text-sm transition active:scale-95 disabled:opacity-60 ${o.isDefault ? "border-emerald-300/30 bg-emerald-300/[0.08] text-emerald-50" : "border-white/12 bg-white/[0.04] text-white/80"}`}
                  >
                    {o.model}
                  </button>
                ))}
              </div>
              {failed === a.id && <p className="mt-1 text-xs text-amber-200">Couldn&apos;t save. Try again.</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
