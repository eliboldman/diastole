"use client";

import { Dices, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import Avatar, { type AvatarState } from "@/components/avatar/Avatar";
import { saveLook } from "@/lib/avatar/actions";
import { drawTile, type TilePart } from "@/lib/avatar/face";
import {
  BROWS,
  BUILD,
  EYE_COLOR,
  EYES,
  FACE_SHAPES,
  FACIAL_HAIR,
  GEAR_COLOR,
  GLASSES,
  HAIR_COLOR,
  HAIR_STYLES,
  HEADWEAR,
  HEIGHT,
  MARKS,
  MOUTHS,
  NOSES,
  SCALE,
  SHIFT,
  SKIN,
  SUIT,
  WATCH,
  label,
  normalizeLook,
  randomLook,
  type Look,
  type Swatch,
} from "@/lib/avatar/look";

/**
 * The avatar creator: a live 3D preview and a tab per part, Mii-editor style, all original art.
 * Proportions stay self-chosen sliders, never suggested or linked to any data. Changes save themselves.
 */

type Tab = { id: string; label: string; zoom: boolean };
const TABS: Tab[] = [
  { id: "face", label: "Face", zoom: true },
  { id: "hair", label: "Hair", zoom: true },
  { id: "eyes", label: "Eyes", zoom: true },
  { id: "brows", label: "Brows", zoom: true },
  { id: "nose", label: "Nose", zoom: true },
  { id: "mouth", label: "Mouth", zoom: true },
  { id: "beard", label: "Facial hair", zoom: true },
  { id: "extras", label: "Freckles", zoom: true },
  { id: "glasses", label: "Glasses", zoom: true },
  { id: "headwear", label: "Headwear", zoom: true },
  { id: "kit", label: "Kit", zoom: false },
  { id: "body", label: "Body", zoom: false },
];

function FaceTile({ look, part, selected, title, onPick }: { look: Look; part: TilePart; selected: boolean; title: string; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(look);
  useEffect(() => {
    if (ref.current) drawTile(ref.current, JSON.parse(key) as Look, part);
  }, [key, part]);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      title={title}
      className={`rounded-[18px] p-1 transition active:scale-95 ${selected ? "bg-emerald-300/25 ring-2 ring-emerald-300" : "bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.08]"}`}
    >
      <canvas ref={ref} width={112} height={112} className="block aspect-square w-full" aria-hidden />
      <span className="sr-only">{title}</span>
    </button>
  );
}

function TextTile({ text, selected, onPick }: { text: string; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`min-h-12 rounded-2xl px-2 text-sm transition active:scale-95 ${
        selected ? "bg-emerald-300/20 text-emerald-50 ring-2 ring-emerald-300" : "bg-white/[0.04] text-white/80 ring-1 ring-white/10 hover:bg-white/[0.08]"
      }`}
    >
      {text}
    </button>
  );
}

function Swatches({ list, value, onPick, name }: { list: Swatch[]; value: string; onPick: (id: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={value === s.id}
          aria-label={s.label}
          title={s.label}
          onClick={() => onPick(s.id)}
          className={`h-10 w-10 rounded-full transition active:scale-90 ${value === s.id ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#0b1512]" : "ring-1 ring-white/20"}`}
          style={{ background: s.hex }}
        />
      ))}
    </div>
  );
}

function Slider({ label: text, value, range, low, high, onChange }: { label: string; value: number; range: { min: number; max: number }; low: string; high: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-white/50">{text}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => navigator.vibrate?.(5)}
        className="h-11 w-full accent-emerald-300"
        aria-label={text}
      />
      <span className="flex justify-between text-xs text-white/45">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-[11px] uppercase tracking-[0.15em] text-white/50">{title}</h3>
    {children}
  </section>
);
const grid = "grid grid-cols-4 gap-2 sm:grid-cols-5";

export default function AvatarCreator({ initial, state }: { initial: unknown; state: AvatarState }) {
  const [look, setLook] = useState<Look>(() => normalizeLook(initial));
  const [tab, setTab] = useState("face");
  const [undo, setUndo] = useState<Look | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

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

  const set = (patch: Partial<Look>) => setLook((l) => normalizeLook({ ...l, ...patch }));
  const zoom = TABS.find((t) => t.id === tab)?.zoom ?? false;
  const with_ = (patch: Partial<Look>) => normalizeLook({ ...look, ...patch });

  // Face-part tiles: each one drawn with the athlete's own face, so they can see the result.
  const faceTiles = <K extends keyof Look>(key: K, options: readonly Look[K][], part: TilePart) => (
    <div className={grid}>
      {options.map((o) => (
        <FaceTile key={String(o)} look={with_({ [key]: o } as Partial<Look>)} part={part} selected={look[key] === o} title={label(String(o))} onPick={() => set({ [key]: o } as Partial<Look>)} />
      ))}
    </div>
  );
  const textTiles = <K extends keyof Look>(key: K, options: readonly Look[K][]) => (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {options.map((o) => (
        <TextTile key={String(o)} text={label(String(o))} selected={look[key] === o} onPick={() => set({ [key]: o } as Partial<Look>)} />
      ))}
    </div>
  );
  const swap = (next: Look) => {
    setUndo(look);
    setLook(next);
  };

  const panel = (() => {
    switch (tab) {
      case "face":
        return (
          <>
            <Section title="Skin">
              <Swatches name="Skin" list={SKIN} value={look.skin} onPick={(skin) => set({ skin })} />
            </Section>
            <Section title="Face shape">{textTiles("face", FACE_SHAPES)}</Section>
          </>
        );
      case "hair":
        return (
          <>
            <Section title="Style">{textTiles("hair", HAIR_STYLES)}</Section>
            <Section title="Color (brows and facial hair match)">
              <Swatches name="Hair color" list={HAIR_COLOR} value={look.hairColor} onPick={(hairColor) => set({ hairColor })} />
            </Section>
          </>
        );
      case "eyes":
        return (
          <>
            <Section title="Style">{faceTiles("eyes", EYES, "eyes")}</Section>
            <Section title="Color">
              <Swatches name="Eye color" list={EYE_COLOR} value={look.eyeColor} onPick={(eyeColor) => set({ eyeColor })} />
            </Section>
            <Slider label="Size" value={look.eyeSize} range={SCALE} low="Smaller" high="Bigger" onChange={(eyeSize) => set({ eyeSize })} />
            <Slider label="Spacing" value={look.eyeGap} range={SCALE} low="Closer" high="Wider" onChange={(eyeGap) => set({ eyeGap })} />
            <Slider label="Height" value={look.eyeY} range={SHIFT} low="Lower" high="Higher" onChange={(eyeY) => set({ eyeY })} />
          </>
        );
      case "brows":
        return (
          <>
            <Section title="Style">{faceTiles("brows", BROWS, "brows")}</Section>
            <Slider label="Height" value={look.browY} range={SHIFT} low="Lower" high="Higher" onChange={(browY) => set({ browY })} />
          </>
        );
      case "nose":
        return (
          <>
            <Section title="Style">{faceTiles("nose", NOSES, "nose")}</Section>
            <Slider label="Size" value={look.noseSize} range={SCALE} low="Smaller" high="Bigger" onChange={(noseSize) => set({ noseSize })} />
          </>
        );
      case "mouth":
        return (
          <>
            <Section title="Style">{faceTiles("mouth", MOUTHS, "mouth")}</Section>
            <Slider label="Size" value={look.mouthSize} range={SCALE} low="Smaller" high="Bigger" onChange={(mouthSize) => set({ mouthSize })} />
            <Slider label="Height" value={look.mouthY} range={SHIFT} low="Lower" high="Higher" onChange={(mouthY) => set({ mouthY })} />
          </>
        );
      case "beard":
        return <Section title="Style (color follows your hair)">{faceTiles("facialHair", FACIAL_HAIR, "facialHair")}</Section>;
      case "extras":
        return <Section title="Freckles and blush">{faceTiles("marks", MARKS, "marks")}</Section>;
      case "glasses":
        return (
          <>
            <Section title="Style">{faceTiles("glasses", GLASSES, "glasses")}</Section>
            {look.glasses !== "none" && (
              <Section title="Frame color">
                <Swatches name="Frame color" list={GEAR_COLOR} value={look.glassesColor} onPick={(glassesColor) => set({ glassesColor })} />
              </Section>
            )}
          </>
        );
      case "headwear":
        return (
          <>
            <Section title="Style">{textTiles("headwear", HEADWEAR)}</Section>
            {look.headwear !== "none" && (
              <Section title="Color">
                <Swatches name="Headwear color" list={GEAR_COLOR} value={look.headwearColor} onPick={(headwearColor) => set({ headwearColor })} />
              </Section>
            )}
          </>
        );
      case "kit":
        return (
          <>
            <Section title="Suit (worked muscles still light up on it)">
              <Swatches name="Suit color" list={SUIT} value={look.suit} onPick={(suit) => set({ suit })} />
            </Section>
            <Section title="Shoes">
              <Swatches name="Shoe color" list={GEAR_COLOR} value={look.shoes} onPick={(shoes) => set({ shoes })} />
            </Section>
            <Section title="Watch">{textTiles("watch", WATCH)}</Section>
            {look.watch !== "none" && <Swatches name="Watch band color" list={GEAR_COLOR} value={look.watchColor} onPick={(watchColor) => set({ watchColor })} />}
          </>
        );
      case "body":
        return (
          <>
            <Slider label="Height" value={look.height} range={HEIGHT} low="Shorter" high="Taller" onChange={(height) => set({ height })} />
            <Slider label="Build" value={look.build} range={BUILD} low="Narrower" high="Broader" onChange={(build) => set({ build })} />
          </>
        );
    }
  })();

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_22rem] md:items-start">
      <div className="sticky top-2 z-10 flex justify-center rounded-[32px] border border-white/10 bg-gradient-to-b from-emerald-300/[0.06] to-[#0b1512]/90 p-2 backdrop-blur-xl md:top-6">
        {zoom ? (
          <Avatar look={look} {...state} variant="bust" live className="h-56 w-56 sm:h-[26rem] sm:w-[26rem]" title="Your avatar's face" />
        ) : (
          <Avatar look={look} {...state} className="h-[22rem] w-56 sm:h-[30rem] sm:w-72" title="Your avatar" />
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Avatar parts">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-10 shrink-0 rounded-full px-4 text-sm transition ${tab === t.id ? "bg-emerald-300 text-[#0b1512]" : "bg-white/[0.06] text-white/75 hover:bg-white/[0.1]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-5" role="tabpanel">
          {panel}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => swap(randomLook())}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] text-sm transition active:scale-95 hover:bg-white/[0.1]"
          >
            <Dices size={16} /> Randomize
          </button>
          {undo && (
            <button
              type="button"
              onClick={() => {
                setLook(undo);
                setUndo(null);
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm transition active:scale-95 hover:bg-white/[0.1]"
            >
              <Undo2 size={16} /> Undo
            </button>
          )}
        </div>
        <p className="text-xs text-white/45" aria-live="polite">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save. Check your connection." : "Drag the figure to turn it. Changes save automatically."}
        </p>
        <p className="text-xs leading-relaxed text-white/40">
          Your avatar glows where you trained when you need recovery, and its aura grows with real milestones: PRs, consistent weeks, FTP and threshold gains.
        </p>
      </div>
    </div>
  );
}
