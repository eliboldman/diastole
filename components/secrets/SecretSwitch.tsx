"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setSecretEnabled } from "@/lib/secrets-actions";

/** On/off for one found secret's effect. */
export default function SecretSwitch({ id, initial }: { id: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        const v = !on;
        setOn(v);
        start(async () => {
          const r = await setSecretEnabled(id, v);
          if (!r.ok) setOn(!v);
          else router.refresh();
        });
      }}
      className="mt-3 flex min-h-10 items-center justify-between gap-2 text-left text-xs text-white/60"
    >
      {on ? "On" : "Off"}
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${on ? "bg-emerald-300" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-5" : "left-1"}`} />
      </span>
    </button>
  );
}
