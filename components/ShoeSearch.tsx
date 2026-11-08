"use client";

import { useId, useMemo, useState } from "react";

import { SHOE_KINDS, type ShoeKind } from "@/lib/closet";
import { catalogLabel, searchShoes } from "@/lib/shoe-catalog";

const kindLabel = (k: ShoeKind) => SHOE_KINDS.find(([x]) => x === k)?.[1] ?? k;

/** The shoe model field: type to search Nike, On, Saucony, Craft, Hoka, Brooks and Altra; picking one fills the model and its type. Free text still works. */
export default function ShoeSearch({ value, onChange, className }: { value: string; onChange: (model: string, kind?: ShoeKind) => void; className: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const list = useId();
  const results = useMemo(() => (open ? searchShoes(value) : []), [open, value]);
  // Already picked exactly this one: nothing to suggest.
  const shown = results.length === 1 && catalogLabel(results[0], value) === value ? [] : results;

  const pick = (i: number) => {
    const s = shown[i];
    if (!s) return;
    onChange(catalogLabel(s, value), s.kind);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={className}
        value={value}
        maxLength={60}
        placeholder="Search, e.g. Pegasus 41"
        aria-label="Shoe model"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={list}
        aria-autocomplete="list"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!shown.length) return;
          const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (step) {
            e.preventDefault();
            setActive((a) => (a + step + shown.length) % shown.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(active);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {shown.length > 0 && (
        <ul id={list} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-panel/95 p-1 shadow-2xl backdrop-blur-xl">
          {shown.map((s, i) => (
            <li
              key={`${s.brand} ${s.model}`}
              role="option"
              aria-selected={i === active}
              // mousedown so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-sm ${i === active ? "bg-white/[0.08]" : ""}`}
            >
              <span className="min-w-0 truncate">
                <span className="text-white/50">{s.brand}</span> {s.model}
              </span>
              <span className="shrink-0 text-xs text-white/45">{kindLabel(s.kind)}</span>
            </li>
          ))}
          <li className="px-3 py-2 text-[11px] text-white/40">Add the version after picking, e.g. 41. Not listed? Just type it.</li>
        </ul>
      )}
    </div>
  );
}
