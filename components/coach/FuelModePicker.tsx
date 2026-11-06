"use client";

import { useState, useTransition } from "react";

import { setFuelMode } from "@/lib/fuel/actions";
import { FUEL_MODES, type FuelMode } from "@/lib/fuel/plan";

const ORDER: FuelMode[] = ["full", "plates", "workout"];

/** How this athlete sees fueling. Saves as soon as you pick. */
export default function FuelModePicker({ athleteId, firstName, mode }: { athleteId: string; firstName: string; mode: FuelMode }) {
  const [value, setValue] = useState(mode);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = (m: FuelMode) => {
    if (m === value) return;
    const before = value;
    setValue(m);
    setNote(null);
    start(async () => {
      const r = await setFuelMode(athleteId, m);
      if (!r.ok) {
        setValue(before);
        setNote(r.error);
      } else setNote(`Saved. ${firstName} sees ${FUEL_MODES[m].label.toLowerCase()}.`);
    });
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Fueling mode" className="grid gap-2 sm:grid-cols-3">
        {ORDER.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m}
            disabled={pending}
            onClick={() => pick(m)}
            className={`min-h-11 rounded-2xl border px-4 py-3 text-left transition ${
              value === m ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
            }`}
          >
            <span className="block text-sm font-medium">{FUEL_MODES[m].label}</span>
            <span className="mt-0.5 block text-xs text-white/55">{FUEL_MODES[m].help}</span>
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-xs text-white/55" role="status">{note}</p>}
    </div>
  );
}
