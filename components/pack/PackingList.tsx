"use client";

import { Check, Plane, Plus, Printer, X } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updatePack } from "@/lib/pack/actions";
import { BAGS, type Bag, type Item, type Reminder, type Travel } from "@/lib/pack/pack";

const field = "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none";
const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The race packing list: grouped by bag, tick as you pack, add your own, set travel and water temperature, print. */
export default function PackingList({ raceId, sport, items, checked, travel, waterC, reminders, today, units, weatherKnown }: { raceId: string; sport: string; items: Item[]; checked: Record<string, boolean>; travel: Travel; waterC: number | null; reminders: (Reminder & { date: string })[]; today: string; units: "mi" | "km"; weatherKnown: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [ticks, setTick] = useOptimistic(checked, (s, a: { key: string; on: boolean }) => ({ ...s, [a.key]: a.on }));
  const [label, setLabel] = useState("");
  const [bag, setBag] = useState<Bag>(sport === "tri" ? "t2" : "morning");
  const [water, setWater] = useState(waterC === null ? "" : String(units === "mi" ? Math.round((waterC * 9) / 5 + 32) : waterC));
  const tri = sport === "tri";
  const bags = BAGS.filter((b) => (tri || !b.tri) && items.some((i) => i.bag === b.key));
  const done = items.filter((i) => ticks[i.key]).length;
  const save = (patch: Parameters<typeof updatePack>[1]) =>
    start(async () => {
      await updatePack(raceId, patch);
      router.refresh();
    });
  const toggle = (key: string) =>
    start(async () => {
      const on = !ticks[key];
      setTick({ key, on });
      await updatePack(raceId, { check: { key, on } });
      router.refresh();
    });
  const nextReminder = reminders.find((r) => r.date >= today);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex rounded-xl border border-white/10 p-0.5" role="radiogroup" aria-label="How you're getting there">
          {(["local", "drive", "fly"] as Travel[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={travel === t} onClick={() => save({ travel: t })} className={`min-h-10 rounded-lg px-3 text-sm ${travel === t ? "bg-emerald-300/20 text-emerald-50" : "text-white/60"}`}>
              {t === "local" ? "Local" : t === "drive" ? "Driving" : (
                <span className="inline-flex items-center gap-1">
                  <Plane size={13} aria-hidden /> Flying
                </span>
              )}
            </button>
          ))}
        </div>
        {(tri || sport === "swim") && (
          <label className="flex items-center gap-2 text-sm text-white/60">
            Water
            <input
              inputMode="decimal"
              value={water}
              onChange={(e) => setWater(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
              onBlur={() => {
                const v = Number(water);
                save({ waterC: water === "" ? null : units === "mi" ? Math.round(((v - 32) * 5) / 9 * 10) / 10 : v });
              }}
              placeholder="?"
              className={`${field} w-16 py-1.5`}
              aria-label={`Water temperature in ${units === "mi" ? "Fahrenheit" : "Celsius"}`}
            />
            {units === "mi" ? "°F" : "°C"}
          </label>
        )}
        <button
          type="button"
          onClick={() => {
            document.body.dataset.printing = "pack";
            window.addEventListener("afterprint", () => delete document.body.dataset.printing, { once: true });
            window.print();
          }}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-white/60 hover:text-white">
          <Printer size={15} aria-hidden /> Print
        </button>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            {done} of {items.length} packed
          </span>
          {!weatherKnown && <span className="text-xs text-white/40">Weather joins the list once it&apos;s in forecast range</span>}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08] print:hidden">
          <div className="h-full rounded-full bg-emerald-300 transition-[width] duration-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Columns, not a grid: short bags stack under each other instead of leaving gaps. */}
      <div className="mt-5 gap-x-5 sm:columns-2">
        {bags.map((b) => (
          <section key={b.key} className="mb-5 break-inside-avoid">
            <h3 className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">{b.label}</h3>
            <ul className="mt-2 grid gap-1">
              {items
                .filter((i) => i.bag === b.key)
                .map((i) => (
                  <li key={i.key} className="flex items-start gap-2">
                    <button type="button" onClick={() => toggle(i.key)} aria-pressed={Boolean(ticks[i.key])} className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-white/[0.03]">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${ticks[i.key] ? "border-emerald-300 bg-emerald-300 text-black" : "border-white/25"}`}>{ticks[i.key] && <Check size={13} strokeWidth={3} aria-hidden />}</span>
                      <span className="min-w-0">
                        <span className={`block text-sm ${ticks[i.key] ? "text-white/45 line-through" : "text-white/90"}`}>
                          {i.label}
                          {i.qty && <span className="text-emerald-100/80"> · {i.qty}</span>}
                        </span>
                        {i.why && <span className="block text-xs text-white/45">{i.why}</span>}
                        {i.source === "coach" && <span className="block text-[11px] text-emerald-200/60">From your coach&apos;s list</span>}
                      </span>
                    </button>
                    {i.source === "mine" && (
                      <button type="button" onClick={() => save({ remove: i.label })} aria-label={`Remove ${i.label}`} className="flex h-11 w-9 shrink-0 items-center justify-center text-white/35 hover:text-red-300 print:hidden">
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      <form
        className="mt-5 flex flex-wrap items-center gap-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          save({ add: { label, bag } });
          setLabel("");
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Add your own item" aria-label="Add your own item" className={`${field} min-w-0 flex-1 basis-48`} />
        <select value={bag} onChange={(e) => setBag(e.target.value as Bag)} aria-label="Which bag" className={`${field} bg-panel`}>
          {BAGS.filter((b) => tri || !b.tri).map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <button className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-50">
          <Plus size={15} aria-hidden /> Add
        </button>
      </form>

      <div className="mt-6 print:mt-4">
        <h3 className="text-sm font-medium">Timeline</h3>
        <ol className="mt-2 grid gap-2">
          {reminders.map((r) => (
            <li key={r.daysOut} className={`flex gap-3 text-sm ${r.date < today ? "opacity-50" : ""}`}>
              <span className={`mt-0.5 w-20 shrink-0 text-xs tabular-nums ${r === nextReminder ? "text-emerald-200" : "text-white/45"}`}>{short(r.date)}</span>
              <span className="min-w-0">
                <span className="block text-white/85">{r.title}</span>
                <span className="block text-xs text-white/50">{r.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-white/40 print:hidden">You&apos;ll get a reminder on each of these evenings.</p>
      </div>
    </div>
  );
}
