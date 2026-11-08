"use client";

import { Check, Plus, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { catalogLabel, type CatalogItem } from "@/lib/catalog-search";

type Kinds<K extends string> = readonly (readonly [K, string])[];

const field = "min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base sm:text-sm placeholder:text-white/35 focus:border-emerald-300/40 focus:outline-none";

/**
 * Search a gear catalog, pick one (or keep what you typed), see the full name and its type, then
 * "Add to closet". Nothing is saved until that last tap.
 */
export default function GearAdder<K extends string>({
  search,
  kinds,
  fallbackKind,
  placeholder,
  noun,
  onAdd,
}: {
  search: (q: string) => CatalogItem<K>[];
  kinds: Kinds<K>;
  fallbackKind: K;
  placeholder: string;
  noun: string; // "shoe", "bike"
  onAdd: (model: string, kind: K) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<{ name: string; kind: K; brand?: string } | null>(null);
  const [extra, setExtra] = useState(""); // version or build: "41", "SL 6"
  const list = useId();
  const results = useMemo(() => (open ? search(q) : []), [open, q, search]);
  const typed = q.trim();
  // Typed something not in the list: offer it as is, last.
  const options: { name: string; kind: K; brand?: string; model?: string }[] = [
    ...results.map((s) => ({ name: catalogLabel(s, q), kind: s.kind, brand: s.brand, model: s.model })),
    ...(typed.length >= 2 && !results.some((s) => catalogLabel(s, q).toLowerCase() === typed.toLowerCase()) ? [{ name: typed.slice(0, 60), kind: fallbackKind }] : []),
  ];
  const kindLabel = (k: K) => kinds.find(([x]) => x === k)?.[1] ?? k;

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    setPicked({ name: o.name, kind: o.kind, brand: o.brand });
    setExtra("");
    setOpen(false);
  };
  const reset = () => {
    setPicked(null);
    setQ("");
    setExtra("");
  };
  const fullName = picked ? `${picked.name}${extra.trim() ? ` ${extra.trim()}` : ""}`.slice(0, 60) : "";

  if (picked) {
    return (
      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-300/[0.05] p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-lg font-medium leading-snug">{fullName}</p>
          <button type="button" onClick={reset} aria-label="Pick a different one" className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.08] hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-white/55">Type</span>
            <select className={`${field} pr-8`} value={picked.kind} onChange={(e) => setPicked({ ...picked, kind: e.target.value as K })}>
              {kinds.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {picked.brand && (
            <label className="block">
              <span className="mb-1 block text-xs text-white/55">Version or build (optional)</span>
              <input className={field} value={extra} maxLength={20} placeholder={noun === "shoe" ? "e.g. 41" : "e.g. SL 7, 2024"} onChange={(e) => setExtra(e.target.value)} />
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onAdd(fullName, picked.kind);
            reset();
          }}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 font-medium text-black transition active:scale-[0.98]"
        >
          <Check size={18} aria-hidden /> Add to closet
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Plus size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" aria-hidden />
        <input
          className={`${field} pl-9`}
          value={q}
          maxLength={60}
          placeholder={placeholder}
          aria-label={`Add a ${noun}`}
          role="combobox"
          aria-expanded={options.length > 0 && open}
          aria-controls={list}
          aria-autocomplete="list"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (!options.length) return;
            const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
            if (step) {
              e.preventDefault();
              setActive((a) => (a + step + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>
      {open && options.length > 0 && (
        <ul id={list} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-panel p-1 shadow-2xl shadow-black/60">
          {options.map((o, i) => (
            <li
              key={`${o.brand ?? "typed"} ${o.name}`}
              role="option"
              aria-selected={i === active}
              // mousedown so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-12 cursor-pointer flex-col justify-center rounded-xl px-3 py-1.5 ${i === active ? "bg-white/[0.08]" : ""}`}
            >
              {o.brand ? (
                <span className="text-[15px] leading-snug">
                  <span className="text-white/55">{o.brand}</span> {o.name.slice(o.brand.length + 1)}
                </span>
              ) : (
                <span className="text-[15px] leading-snug">Use “{o.name}”</span>
              )}
              <span className="text-[11px] text-white/45">{o.brand ? kindLabel(o.kind) : "Not in the list. Pick its type next"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
