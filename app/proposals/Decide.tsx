"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decide } from "./actions";

export type Choice = { value: string; label: string; primary?: boolean };

/** The proposal's buttons: one tap applies it (and updates the watch), or keeps the plan as it was. */
export default function Decide({ id, choices }: { id: string; choices: Choice[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (msg?.ok) return <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.06] p-4 text-sm text-emerald-50">{msg.text}</p>;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await decide(id, c.value);
                setMsg({ ok: r.ok, text: r.message });
                if (r.ok) router.refresh();
              })
            }
            className={
              c.primary
                ? "min-h-11 rounded-xl border border-emerald-300/25 bg-emerald-300/15 px-4 text-sm font-medium text-emerald-50 hover:bg-emerald-300/25 disabled:opacity-50"
                : "min-h-11 rounded-xl border border-white/10 px-4 text-sm text-white/70 hover:bg-white/[0.05] disabled:opacity-50"
            }
          >
            {c.label}
          </button>
        ))}
      </div>
      {msg && !msg.ok && <p className="mt-3 text-sm text-rose-200">{msg.text}</p>}
    </div>
  );
}
