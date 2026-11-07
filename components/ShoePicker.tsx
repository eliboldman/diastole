"use client";

import { Footprints } from "lucide-react";
import { useState, useTransition } from "react";

import { setActivityShoe } from "@/lib/closet-actions";

/** "Shoes" on a run: which pair it counts toward (the default pair unless changed). */
export default function ShoePicker({
  activityId,
  shoes,
  defaultId,
  initial,
}: {
  activityId: string;
  shoes: { id: string; model: string }[];
  defaultId: string | null;
  initial: string | null;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const def = shoes.find((s) => s.id === defaultId);

  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      <span className="flex items-center gap-2 text-white/60">
        <Footprints size={16} aria-hidden /> Shoes
      </span>
      <select
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm sm:max-w-xs"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          startTransition(async () => {
            const r = await setActivityShoe(activityId, v || null);
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
