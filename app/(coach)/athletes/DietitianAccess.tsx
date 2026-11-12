"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setDietitianAccess } from "./actions";

type Athlete = { id: string; name: string };

/** The coach picks which athletes this dietitian can see: all of them, or only the ones ticked. */
export default function DietitianAccess({
  target,
  roster,
  all: initialAll,
  picked: initialPicked,
}: {
  target: { dietitian: string } | { invite: string };
  roster: Athlete[];
  all: boolean;
  picked: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(initialAll);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialPicked));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const summary = initialAll ? "Sees all athletes" : `Sees ${initialPicked.length} of ${roster.length} athletes`;

  const save = () =>
    start(async () => {
      const r = await setDietitianAccess(target, all, [...picked]);
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen(!open)} className="min-h-11 text-left text-sm text-emerald-200/90 hover:underline" aria-expanded={open}>
        {summary} · {open ? "close" : "change"}
      </button>
      {msg && !open && <span className={`ml-2 text-xs ${msg.ok ? "text-white/55" : "text-red-300"}`}>{msg.text}</span>}
      {open && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-4">
          <fieldset>
            <legend className="sr-only">Which athletes this dietitian can see</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" checked={all} onChange={() => setAll(true)} className="h-4 w-4 accent-emerald-300" />
              <span>
                All athletes <span className="text-white/45">(including ones you invite later)</span>
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" checked={!all} onChange={() => setAll(false)} className="h-4 w-4 accent-emerald-300" />
              <span>Only the athletes I pick</span>
            </label>
          </fieldset>
          {!all && (
            <ul className="mt-2 grid gap-1 border-t border-white/[0.08] pt-2 sm:grid-cols-2">
              {roster.map((a) => (
                <li key={a.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      checked={picked.has(a.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(a.id);
                        else next.delete(a.id);
                        setPicked(next);
                      }}
                      className="h-4 w-4 accent-emerald-300"
                    />
                    <span className="text-white/85">{a.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className="min-h-11 rounded-xl bg-emerald-300 px-4 text-sm font-medium text-emerald-950 disabled:opacity-50">
              {busy ? "Saving…" : "Save access"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-3 text-sm text-white/60 hover:bg-white/[0.06]">
              Cancel
            </button>
            {!all && picked.size === 0 && <span className="text-xs text-amber-200/90">With nobody picked, they&apos;ll see no athletes.</span>}
            {msg && !msg.ok && <span className="text-xs text-red-300">{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
