"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteSweatTest, saveSweatTest } from "@/lib/fuel/race-actions";

const field = "w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[16px] tabular-nums focus:border-emerald-300/40 focus:outline-none";
const num = (v: string) => v.replace(/[^0-9.]/g, "").slice(0, 6);

/** Sweat-rate test. Only the resulting rate is saved; the weights stay on this screen. */
export default function SweatTest({ units, tests }: { units: "mi" | "km"; tests: { id: string; tested_on: string; sweat_rate_ml_h: number; minutes: number; temp_c: number | null }[] }) {
  const router = useRouter();
  const unit = units === "mi" ? "lb" : "kg";
  const [f, setF] = useState({ pre: "", post: "", drank: "", peed: "", minutes: "60", temp: "", sport: "run" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === "sport" ? e.target.value : num(e.target.value) });
  const tempC = (v: string) => (v ? (units === "mi" ? ((Number(v) - 32) * 5) / 9 : Number(v)) : null);

  return (
    <div>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-white/60">
        <li>Weigh yourself without clothes right before a steady session of an hour or so.</li>
        <li>Note how much you drink during it.</li>
        <li>Towel off and weigh again right after, before drinking more.</li>
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveSweatTest({
              pre: Number(f.pre),
              post: Number(f.post),
              unit,
              drankMl: Number(f.drank) * (units === "mi" ? 29.5735 : 1),
              peedMl: 0,
              minutes: Number(f.minutes),
              tempC: tempC(f.temp),
              sport: f.sport,
              date: new Date().toLocaleDateString("en-CA"),
            });
            if (!r.ok) return setMsg(r.error);
            setMsg(`Sweat rate: about ${r.rate} ml per hour. Saved; your weights weren't.`);
            setF({ ...f, pre: "", post: "", drank: "" });
            router.refresh();
          });
        }}
        className="grid grid-cols-2 gap-3"
      >
        <label>
          <span className="text-sm text-white/60">Before ({unit})</span>
          <input inputMode="decimal" value={f.pre} onChange={set("pre")} className={`${field} mt-1`} />
        </label>
        <label>
          <span className="text-sm text-white/60">After ({unit})</span>
          <input inputMode="decimal" value={f.post} onChange={set("post")} className={`${field} mt-1`} />
        </label>
        <label>
          <span className="text-sm text-white/60">Drank ({units === "mi" ? "fl oz" : "ml"})</span>
          <input inputMode="decimal" value={f.drank} onChange={set("drank")} placeholder="0" className={`${field} mt-1`} />
        </label>
        <label>
          <span className="text-sm text-white/60">Minutes</span>
          <input inputMode="numeric" value={f.minutes} onChange={set("minutes")} className={`${field} mt-1`} />
        </label>
        <label>
          <span className="text-sm text-white/60">Temperature (°{units === "mi" ? "F" : "C"}, optional)</span>
          <input inputMode="decimal" value={f.temp} onChange={set("temp")} className={`${field} mt-1`} />
        </label>
        <label>
          <span className="text-sm text-white/60">Session</span>
          <select value={f.sport} onChange={set("sport")} className={`${field} mt-1`}>
            <option value="run">Run</option>
            <option value="bike">Bike</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-3">
          <button disabled={pending || !f.pre || !f.post} className="min-h-12 rounded-2xl bg-emerald-300 px-6 font-medium text-[#0d1513] disabled:opacity-50">
            Work it out
          </button>
          {msg && <p className="text-sm text-white/70">{msg}</p>}
        </div>
      </form>
      {tests.length > 0 && (
        <ul className="mt-5 divide-y divide-white/[0.06] text-sm">
          {tests.map((t) => (
            <li key={t.id} className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-white/55">{new Date(`${t.tested_on}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              <span className="flex-1 tabular-nums">
                {t.sweat_rate_ml_h} ml/h · {t.minutes} min
                {t.temp_c != null ? ` · ${units === "mi" ? Math.round((Number(t.temp_c) * 9) / 5 + 32) + "°F" : Math.round(Number(t.temp_c)) + "°C"}` : ""}
              </span>
              <button aria-label="Delete this test" onClick={() => start(async () => void (await deleteSweatTest(t.id), router.refresh()))} className="flex h-10 w-10 items-center justify-center text-white/40 hover:text-white">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
