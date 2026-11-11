"use client";

import { Backpack, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { saveMasterList } from "@/lib/pack/actions";
import { BAGS, type Bag, type MasterItem } from "@/lib/pack/pack";

const field = "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[16px] text-white focus:border-emerald-300/40 focus:outline-none";
const SPORTS = [
  { key: "", label: "Every race" },
  { key: "tri", label: "Triathlons" },
  { key: "run", label: "Runs" },
  { key: "bike", label: "Bike races" },
  { key: "swim", label: "Swims" },
];

/** Coach: items added to every athlete's race packing list (optionally only for some race types). */
export default function MasterList({ initial }: { initial: MasterItem[] }) {
  const [items, setItems] = useState(initial);
  const [label, setLabel] = useState("");
  const [bag, setBag] = useState<Bag>("morning");
  const [sport, setSport] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const persist = (next: MasterItem[]) => {
    setItems(next);
    start(async () => {
      const r = await saveMasterList(next);
      setMsg(r.ok ? "Saved. Athletes see it on their packing lists." : (r.error ?? "Couldn't save."));
    });
  };
  return (
    <details className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.055] p-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-lg font-medium">
        <Backpack size={18} className="text-emerald-200" aria-hidden /> Race packing master list
        <span className="ml-auto text-xs font-normal text-white/45">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </summary>
      <p className="mt-1 text-sm text-white/55">Your must-haves, added to every athlete&apos;s race packing list alongside what Diastole builds from the race, weather and their gear.</p>
      {items.length > 0 && (
        <ul className="mt-4 grid gap-1">
          {items.map((m, i) => (
            <li key={`${m.label}-${i}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1">
                {m.label}
                <span className="block text-xs text-white/45">
                  {BAGS.find((b) => b.key === m.bag)?.label} · {m.sports?.length ? SPORTS.find((s) => s.key === m.sports![0])?.label : "Every race"}
                </span>
              </span>
              <button type="button" disabled={pending} onClick={() => persist(items.filter((_, j) => j !== i))} aria-label={`Remove ${m.label}`} className="flex h-10 w-10 items-center justify-center text-white/40 hover:text-red-300">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          persist([...items, { label: label.trim(), bag, sports: sport ? [sport] : [] }]);
          setLabel("");
        }}
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Spare cleats" aria-label="Item" className={`${field} min-w-0 flex-1 basis-48`} />
        <select value={bag} onChange={(e) => setBag(e.target.value as Bag)} aria-label="Bag" className={`${field} bg-panel`}>
          {BAGS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <select value={sport} onChange={(e) => setSport(e.target.value)} aria-label="Which races" className={`${field} bg-panel`}>
          {SPORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button disabled={pending} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 text-sm text-emerald-50 disabled:opacity-40">
          <Plus size={15} aria-hidden /> Add
        </button>
      </form>
      {msg && <p className="mt-2 text-xs text-white/55">{msg}</p>}
      <p className="mt-2 text-xs text-white/40">Transition and special-needs items only show for triathlons.</p>
    </details>
  );
}
