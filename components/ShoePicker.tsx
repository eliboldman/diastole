"use client";

import { Bike, Footprints } from "lucide-react";
import { useState, useTransition } from "react";

import { setActivityBike, setActivityShoe } from "@/lib/closet-actions";

/**
 * "Shoes" on a run or "Bike" on a ride: which item it counts toward. Shoes fall back to the
 * default pair; bikes fall back to "Not set" (or the only bike).
 */
export default function ShoePicker({
  activityId,
  shoes,
  defaultId,
  initial,
  gear = "shoe",
}: {
  activityId: string;
  shoes: { id: string; model: string }[];
  defaultId: string | null;
  initial: string | null;
  gear?: "shoe" | "bike";
}) {
  const [value, setValue] = useState(initial ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const def = shoes.find((s) => s.id === defaultId);
  const Icon = gear === "bike" ? Bike : Footprints;

  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      <span className="flex items-center gap-2 text-white/60">
        <Icon size={16} aria-hidden /> {gear === "bike" ? "Bike" : "Shoes"}
      </span>
      <select
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base sm:max-w-xs sm:text-sm"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          startTransition(async () => {
            const r = gear === "bike" ? await setActivityBike(activityId, v || null) : await setActivityShoe(activityId, v || null);
            setStatus(r.ok ? "saved" : "error");
          });
        }}
      >
        <option value="">{def ? `${def.model} (default)` : "Not set"}</option>
        {shoes
          .filter((s) => s.id !== defaultId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.model}
            </option>
          ))}
      </select>
      <span className="text-xs text-white/45" aria-live="polite">
        {status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : ""}
      </span>
    </label>
  );
}
