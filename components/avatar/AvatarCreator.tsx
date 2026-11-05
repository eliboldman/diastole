"use client";

import { Check, Dices, Lock } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import Avatar, { type AvatarState } from "@/components/avatar/Avatar";
import { saveLook } from "@/lib/avatar/actions";
import { BUILD, HEIGHT, normalizeLook, PARTS, randomLook, toggleAccessory, type Look } from "@/lib/avatar/look";
import { UNLOCK_HINT } from "@/lib/avatar/unlocks";

type Tab = "body" | "face" | "hair" | "outfit" | "gear";
const TABS: { id: Tab; label: string }[] = [
  { id: "body", label: "Body" },
  { id: "face", label: "Face" },
  { id: "hair", label: "Hair" },
  { id: "outfit", label: "Outfit" },
  { id: "gear", label: "Gear" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] uppercase tracking-[0.15em] text-white/50">{title}</h3>
      {children}
    </section>
  );
}

function Swatches({ list, value, onPick, label }: { list: { id: string; value: string }[]; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          aria-label={`${label} ${c.id}`}
          onClick={() => onPick(c.id)}
          className={`h-11 w-11 rounded-full ring-offset-2 ring-offset-panel transition active:scale-90 ${value === c.id ? "ring-2 ring-emerald-300" : "ring-1 ring-white/15"}`}
          style={{ background: c.value }}
        />
      ))}
    </div>
  );
}

export default function AvatarCreator({ initial, unlocked: unlockedList, state }: { initial: unknown; unlocked: string[]; state: AvatarState }) {
  const unlocked = new Set(unlockedList);
  const [look, setLook] = useState<Look>(() => normalizeLook(initial));
  const [tab, setTab] = useState<Tab>("body");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  // Every change saves itself (debounced), so there's no Save button to forget.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setStatus("saving");
      const r = await saveLook(look);
      setStatus(r.ok ? "saved" : "error");
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [look]);

  const set = (patch: Partial<Look>) => {
    navigator.vibrate?.(5);
    setLook((l) => normalizeLook({ ...l, ...patch }));
  };

  // A grid of options, each previewed on the athlete's own avatar.
  const options = ({
    list,
    current,
    onPick,
    variant = "bust",
    preview,
    variantOf,
  }: {
    list: { id: string; label: string; unlock?: string }[];
    current: string | string[];
    onPick: (id: string) => void;
    variant?: "bust" | "full";
    preview: (id: string) => Look;
    variantOf?: (id: string) => "bust" | "full";
  }) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map((o) => {
        const locked = o.unlock && !unlocked.has(o.unlock);
        const on = Array.isArray(current) ? current.includes(o.id) : current === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={Boolean(locked)}
            aria-pressed={on}
            onClick={() => onPick(o.id)}
            title={locked ? UNLOCK_HINT[o.unlock!] : o.label}
            className={`relative flex flex-col items-center rounded-2xl border p-1.5 pb-2 text-center transition active:scale-95 ${
              on ? "border-emerald-300/60 bg-emerald-300/[0.1]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
            } ${locked ? "cursor-not-allowed" : ""}`}
          >
            <Avatar
              look={preview(o.id)}
              variant={variantOf?.(o.id) ?? variant}
              className={`${(variantOf?.(o.id) ?? variant) === "bust" ? "h-24 w-24" : "h-24 w-16"} ${locked ? "opacity-35 grayscale" : ""}`}
            />
            <span className="mt-1 line-clamp-1 text-[11px] text-white/70">{o.label}</span>
            {locked && (
              <span className="absolute inset-x-1 top-1 flex flex-col items-center gap-0.5 rounded-xl bg-black/50 px-1 py-1 text-[10px] leading-tight text-amber-100">
                <Lock size={12} aria-hidden />
                {UNLOCK_HINT[o.unlock!]}
              </span>
            )}
            {on && <Check size={14} className="absolute right-1.5 top-1.5 text-emerald-200" aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  const slider = (key: "height" | "build", range: { min: number; max: number }, lowLabel: string, highLabel: string, label: string) => (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={0.01}
        value={look[key]}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
        className="h-11 w-full accent-emerald-300"
        aria-label={label}
      />
      <span className="flex justify-between text-xs text-white/45">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </span>
    </label>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* Preview: sticks while the options scroll */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col items-center rounded-[28px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
          <Avatar look={look} {...state} className="h-64 w-44 sm:h-72 sm:w-48" title="Your avatar" />
          <p className="mt-1 h-5 text-xs text-white/45" aria-live="polite">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Check your connection." : "Changes save automatically"}
          </p>
          <div className="mt-3 flex w-full gap-2">
            <button
              type="button"
              onClick={() => set(randomLook(unlocked))}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] text-sm transition active:scale-95 hover:bg-white/[0.1]"
            >
              <Dices size={16} /> Randomize
            </button>
          </div>
          <div className="mt-3 grid w-full grid-cols-4 gap-1.5">
            {PARTS.presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ ...(p.look as Look), skin: look.skin })}
                title={`Start from ${p.label}`}
                className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-1 transition active:scale-95 hover:bg-white/[0.07]"
              >
                <Avatar look={{ ...(p.look as Look), skin: look.skin }} variant="bust" className="h-12 w-12" />
                <span className="text-[10px] text-white/60">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-11 shrink-0 rounded-full px-5 text-sm transition ${tab === t.id ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/30" : "text-white/60 hover:text-white"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "body" && (
          <>
            <Section title="Body">
              {options({ list: PARTS.bodies, current: look.body, onPick: (id) => set({ body: id }), variant: "full", preview: (id) => ({ ...look, body: id }) })}
            </Section>
            <Section title="Height">{slider("height", HEIGHT, "Shorter", "Taller", "Height")}</Section>
            <Section title="Build">{slider("build", BUILD, "Narrower", "Broader", "Build")}</Section>
            <Section title="Skin tone">
              <Swatches list={PARTS.colors.skin} value={look.skin} onPick={(id) => set({ skin: id })} label="Skin tone" />
            </Section>
          </>
        )}
        {tab === "face" && (
          <>
            <Section title="Face shape">
              {options({ list: PARTS.faces, current: look.face, onPick: (id) => set({ face: id }), preview: (id) => ({ ...look, face: id, accessories: [] }) })}
            </Section>
            <Section title="Eyes">
              {options({ list: PARTS.eyes, current: look.eyes, onPick: (id) => set({ eyes: id }), preview: (id) => ({ ...look, eyes: id, accessories: [] }) })}
            </Section>
            <Section title="Brows">
              {options({ list: PARTS.brows, current: look.brows, onPick: (id) => set({ brows: id }), preview: (id) => ({ ...look, brows: id, accessories: [] }) })}
            </Section>
            <Section title="Facial hair">
              {options({ list: PARTS.facialHair, current: look.facialHair, onPick: (id) => set({ facialHair: id }), preview: (id) => ({ ...look, facialHair: id, accessories: [] }) })}
            </Section>
          </>
        )}
        {tab === "hair" && (
          <>
            <Section title="Style">
              {options({ list: PARTS.hair, current: look.hair, onPick: (id) => set({ hair: id }), preview: (id) => ({ ...look, hair: id, accessories: [] }) })}
            </Section>
            <Section title="Color">
              <Swatches list={PARTS.colors.hair} value={look.hairColor} onPick={(id) => set({ hairColor: id })} label="Hair color" />
            </Section>
          </>
        )}
        {tab === "outfit" && (
          <>
            <Section title="Outfit">
              {options({ list: PARTS.outfits, current: look.outfit, onPick: (id) => set({ outfit: id }), variant: "full", preview: (id) => ({ ...look, outfit: id }) })}
            </Section>
            <Section title="Main color">
              <Swatches list={PARTS.colors.outfit} value={look.outfitColor} onPick={(id) => set({ outfitColor: id })} label="Outfit color" />
            </Section>
            <Section title="Accent">
              <Swatches list={PARTS.colors.accent} value={look.accent} onPick={(id) => set({ accent: id })} label="Accent color" />
            </Section>
            <Section title="Shoes">
              {options({ list: PARTS.shoes, current: look.shoes, onPick: (id) => set({ shoes: id }), variant: "full", preview: (id) => ({ ...look, shoes: id }) })}
            </Section>
          </>
        )}
        {tab === "gear" && (
          <Section title="Accessories (one per spot: head, eyes, wrist, chest, neck)">
            {options({ list: PARTS.accessories, current: look.accessories, onPick: (id) => setLook((l) => toggleAccessory(l, id)), variant: "full", preview: (id) => toggleAccessory({ ...look, accessories: look.accessories.filter((a) => a !== id) }, id), variantOf: (id) => (["head", "eyes"].includes(PARTS.accessories.find((a) => a.id === id)?.slot ?? "") ? "bust" : "full") })}
          </Section>
        )}
      </div>
    </div>
  );
}
