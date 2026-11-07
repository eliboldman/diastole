"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteGutSession, saveGutSession } from "@/lib/fuel/race-actions";

const field = "w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] focus:border-emerald-300/40 focus:outline-none";
const COMFORT = ["Bad", "Rough", "Okay", "Good", "Perfect"];

/** Gut training: practice race-level carbs in long sessions and note how the stomach coped. */
export default function GutTraining({ sessions, best }: { sessions: { id: string; on_date: string; carbs_g_per_h: number; minutes: number | null; comfort: number; products: string | null }[]; best: number | null }) {
  const router = useRouter();
  const [f, setF] = useState({ carbs: "60", minutes: "", comfort: 0, products: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="mb-4 text-sm text-white/60">
        Your gut can learn to handle more carbs. In long sessions, take race-level fuel and step it up 5–10 g/h every week or two.
        {best != null && <span className="text-emerald-100"> Most you&apos;ve handled well: {best} g/h.</span>}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveGutSession({ date: new Date().toLocaleDateString("en-CA"), carbs: Number(f.carbs), minutes: f.minutes ? Number(f.minutes) : null, comfort: f.comfort, products: f.products, note: "" });
            if (!r.ok) return setMsg(r.error);
            setMsg("Logged.");
            setF({ ...f, comfort: 0, products: "" });
            router.refresh();
          });
        }}
        className="grid grid-cols-2 gap-3"
      >
        <label>
          <span className="text-sm text-white/60">Carbs per hour (g)</span>
          <input inputMode="numeric" value={f.carbs} onChange={(e) => setF({ ...f, carbs: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={`${field} mt-1 tabular-nums`} />
        </label>
        <label>
          <span className="text-sm text-white/60">Minutes (optional)</span>
          <input inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={`${field} mt-1 tabular-nums`} />
        </label>
        <label className="col-span-2">
          <span className="text-sm text-white/60">What you took (optional)</span>
          <input value={f.products} maxLength={120} onChange={(e) => setF({ ...f, products: e.target.value })} placeholder="2 gels + drink mix" className={`${field} mt-1`} />
        </label>
        <fieldset className="col-span-2">
          <legend className="text-sm text-white/60">How did your stomach feel?</legend>
          <div className="mt-1 grid grid-cols-5 gap-1.5">
            {COMFORT.map((c, i) => (
              <button key={c} type="button" aria-pressed={f.comfort === i + 1} onClick={() => setF({ ...f, comfort: i + 1 })} className={`min-h-11 rounded-xl border px-1 text-xs ${f.comfort === i + 1 ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 text-white/65"}`}>
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="col-span-2 flex items-center gap-3">
          <button disabled={pending || !f.comfort || !f.carbs} className="min-h-12 rounded-2xl bg-emerald-300 px-6 font-medium text-[#0d1513] disabled:opacity-50">
            Log session
          </button>
          {msg && <p className="text-sm text-white/60">{msg}</p>}
        </div>
      </form>
      {sessions.length > 0 && (
        <ul className="mt-5 divide-y divide-white/[0.06] text-sm">
          {sessions.slice(0, 8).map((s) => (
            <li key={s.id} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-white/55">{new Date(`${s.on_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="tabular-nums">{s.carbs_g_per_h} g/h</span>
                <span className="text-white/50"> · {COMFORT[s.comfort - 1]}{s.products ? ` · ${s.products}` : ""}</span>
              </span>
              <button aria-label="Delete this session" onClick={() => start(async () => void (await deleteGutSession(s.id), router.refresh()))} className="flex h-10 w-10 items-center justify-center text-white/40 hover:text-white">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
